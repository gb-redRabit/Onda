import { app, BrowserWindow, session } from 'electron';
import { logger } from '../../../shared/logger';
import { pipWindowIcon } from '../../pip/pip-icon';
import { setProviderCookie, setProviderRefresh, setProviderToken } from './provider-credentials';
import { domainMatches, GDRIVE_DOMAINS } from './types';

// Import cookie przez wbudowane okno logowania (wzorzec z youtube-auth).
// Pętla pollingu sprawdza obecność cookies sesyjnych danego serwisu i po zalogowaniu
// automatycznie zapisuje cookie (szyfrowane przez safeStorage) oraz zamyka okno.
// Jeśli użytkownik zamknie okno ręcznie po zalogowaniu, cookies również są zapisywane.

// Partycja logowania jest PER-PROVIDER — izoluje cookies między logowaniami (np. sesja
// Google dla Drive nie współdzieli „słoika" z innymi serwisami). `PROVIDER_LOGIN_PARTITION`
// to dawna wspólna partycja (utrzymana wyłącznie do czyszczenia przy resetach).
export const PROVIDER_LOGIN_PARTITION = 'persist:provider-login';
function partitionFor(providerId: string): string {
  const safe = providerId.replace(/[^a-z0-9_-]/gi, '') || 'default';
  return `persist:provider-login-${safe}`;
}
export function providerLoginPartitions(): string[] {
  return [PROVIDER_LOGIN_PARTITION, ...Object.keys(LOGIN_META).map(partitionFor)];
}
const LOGIN_POLL_MS = 1000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

interface LoginMeta {
  url: string;
  domains: string[];
  sessionCookies: string[];
  // Niektóre serwisy (PikPak) trzymają sesję w localStorage, nie w cookies — klucz wpisu
  // z access_token (JSON). Gdy ustawione, odczytujemy token i wysyłamy `Authorization: Bearer`.
  authTokenKey?: string;
}

// Provider → strona logowania + domeny + nazwy cookies sesyjnych (do auto-detekcji końca logowania).
const LOGIN_META: Record<string, LoginMeta> = {
  // PikPak: logowanie KONTEM (e-mail/telefon + hasło) — Google GSI jest blokowane przez
  // Google w oknie Electrona (embedded browser), więc kierujemy wprost na stronę logowania
  // hasłem, a nie na QR/Google.
  pikpak: {
    url: 'https://mypikpak.com/drive/account/password',
    domains: ['mypikpak.com', 'mypikpak.net'],
    sessionCookies: ['lt', 'token', 'sessionid', '__sign_session', 'webp'],
    authTokenKey: 'credentials_YUMx5nI8ZU8Ap8pm'
  },
  // Google Drive: logowanie Google (jak YouTube) — dla plików/folderów prywatnych.
  gdrive: {
    url: 'https://drive.google.com/',
    domains: GDRIVE_DOMAINS,
    sessionCookies: ['SID', 'HSID', '__Secure-1PSID', '__Secure-3PSID', 'SAPISID', 'APISID']
  }
};

function filterDomainCookies(cookies: Electron.Cookie[], domains: string[]): Electron.Cookie[] {
  return cookies.filter((c) => !!c.value && domains.some((d) => domainMatches(c.domain || '', d)));
}

function hasSessionCookies(cookies: Electron.Cookie[], meta: LoginMeta): boolean {
  const domainCookies = filterDomainCookies(cookies, meta.domains);
  return domainCookies.some((c) => meta.sessionCookies.includes(c.name));
}

// Providery, których logowanie na stronie odbywa się przez Google (pełnostronicowe
// przekierowanie na accounts.google.com, jak przy YouTube). GSI/„Sign in with Google"
// jest blokowane przez Google w Electronie, więc dla tych providerów wstępnie (jeśli brak
// sesji Google) otwieramy pełnostronicowe logowanie Google, a potem stronę providera.
const GOOGLE_LOGIN_PROVIDERS = new Set(['gdrive']);
const GOOGLE_SESSION_COOKIES = ['SID', 'HSID', '__Secure-1PSID', '__Secure-3PSID', 'SAPISID'];

function hasGoogleSession(cookies: Electron.Cookie[]): boolean {
  return cookies.some(
    (c) =>
      !!c.value &&
      domainMatches(c.domain || '', 'google.com') &&
      GOOGLE_SESSION_COOKIES.includes(c.name)
  );
}

// Google/GSI odrzucają „wbudowane przeglądarki" po User-Agencie. Surowy UA Electrona
// zawiera token aplikacji (np. `onda/0.8.0`) i `Electron/…`, których normalna Chrome nie ma.
// Budujemy CZYSTY UA Chrome (pełnoprawna przeglądarka) — to udokumentowany sposób
// minimalizowania detekcji embedded browser (Electron: ses.setUserAgent / webContents.setUserAgent).
function cleanChromeUserAgent(): string {
  const version = process.versions.chrome || '126.0.0.0';
  const platform =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'linux'
        ? 'X11; Linux x86_64'
        : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

async function seedGoogleSession(targetPartition: string): Promise<number> {
  try {
    const { getSessionCookies } = await import('../../youtube/youtube-auth-session');
    const cookies = await getSessionCookies();
    if (!cookies.length) return 0;
    const target = session.fromPartition(targetPartition);
    let copied = 0;
    for (const c of cookies) {
      const host = (c.domain || '').replace(/^\./, '');
      if (!c.name || !c.value || !host) continue;
      try {
        await target.cookies.set({
          url: `https://${host}${c.path || '/'}`,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: c.secure ?? true,
          httpOnly: c.httpOnly ?? false,
          sameSite: c.sameSite,
          ...(c.expirationDate ? { expirationDate: c.expirationDate } : {})
        });
        copied++;
      } catch {
        // pojedyncze cookie może zostać odrzucone (np. __Host- bez atrybutów)
      }
    }
    return copied;
  } catch {
    return 0;
  }
}

// Czyta access_token z localStorage okna logowania (PikPak trzyma tam sesję, nie w cookies).
async function readAuthToken(
  win: BrowserWindow,
  key: string
): Promise<{ accessToken: string; refreshToken: string }> {
  try {
    const raw = (await win.webContents.executeJavaScript(
      `(() => { try { return localStorage.getItem(${JSON.stringify(key)}) || ''; } catch (e) { return ''; } })()`
    )) as string;
    if (!raw) return { accessToken: '', refreshToken: '' };
    const obj = JSON.parse(raw) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: string;
    };
    const refreshToken = obj?.refresh_token || '';
    const accessToken = obj?.access_token || '';
    if (!accessToken) return { accessToken: '', refreshToken };
    if (obj.expires_at) {
      const exp = Date.parse(obj.expires_at);
      if (Number.isFinite(exp) && exp < Date.now()) return { accessToken: '', refreshToken };
    }
    return { accessToken, refreshToken };
  } catch {
    return { accessToken: '', refreshToken: '' };
  }
}

export function isProviderLoginSupported(providerId: string): boolean {
  return !!LOGIN_META[providerId];
}

export function listLoginProviderIds(): string[] {
  return Object.keys(LOGIN_META);
}

let loginWindow: BrowserWindow | null = null;

export function closeProviderLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }
  loginWindow = null;
}

export async function startProviderLogin(providerId: string): Promise<{
  success: boolean;
  canceled?: boolean;
  error?: string;
}> {
  const meta = LOGIN_META[providerId];
  if (!meta) return { success: false, error: 'Logowanie nieobsługiwane dla tego providera' };
  const partition = partitionFor(providerId);
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return { success: false, canceled: true, error: 'Okno logowania już otwarte' };
  }

  const win = new BrowserWindow({
    width: 960,
    height: 720,
    autoHideMenuBar: true,
    title: `${providerId.toUpperCase()} — Logowanie`,
    // Ciemne tło zgodne z aplikacją (unika białego błysku); ikona aplikacji zamiast Electrona.
    backgroundColor: '#0f0f17',
    icon: pipWindowIcon(),
    show: false,
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  loginWindow = win;
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  let closed = false;
  const closedPromise = new Promise<void>((resolve) => {
    win.once('closed', () => {
      closed = true;
      if (loginWindow === win) loginWindow = null;
      resolve();
    });
  });

  // Ustaw czysty UA Chrome na sesji logowania i w oknie (Google/GSI odrzuca UA Electrona).
  const ua = cleanChromeUserAgent();
  try {
    session.fromPartition(partition).setUserAgent(ua);
  } catch {
    /* ignoruj */
  }
  try {
    win.webContents.setUserAgent(ua);
  } catch {
    /* ignoruj */
  }

  // Strony logowania mogą otwierać POPUP (np. okno OAuth/„Continue with…"). Blokada
  // popupów (`action:'deny'`) sprawiała, że taki przycisk nic nie robi — dlatego pozwalamy
  // na popup i trzymamy go w tej samej partycji, żeby jego cookies też zostały zebrane.
  const popups = new Set<BrowserWindow>();
  const onWindowCreated = (_event: Electron.Event, created: BrowserWindow): void => {
    if (created === win) return;
    popups.add(created);
    try {
      if (ua) created.webContents.setUserAgent(ua);
    } catch {
      /* ignoruj */
    }
  };
  app.on('browser-window-created', onWindowCreated);
  win.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    }
  }));

  const cleanupWindowTracking = (): void => {
    app.removeListener('browser-window-created', onWindowCreated);
  };
  const remainingPopups = (): BrowserWindow[] => [...popups].filter((bw) => !bw.isDestroyed());

  // Dla providerów logujących przez Google (Drive): jeśli mamy już sesję Google z logowania
  // YouTube, kopiujemy ją do partycji logowania. Gdy sesji nie ma, otwieramy najpierw
  // PEŁNOSTRONICOWE logowanie Google (działa w Electronie jak przy YouTube), a po zalogowaniu
  // automatycznie przechodzimy do strony providera.
  let startUrl = meta.url;
  let needsGoogleFirst = false;
  if (GOOGLE_LOGIN_PROVIDERS.has(providerId)) {
    const copied = await seedGoogleSession(partition);
    if (copied > 0) {
      logger.info('providers', `seeded ${copied} Google cookies for ${providerId} login`);
    } else {
      startUrl = 'https://accounts.google.com/';
      needsGoogleFirst = true;
    }
  }
  let advancedToProvider = !needsGoogleFirst;

  void win.loadURL(startUrl).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('ERR_ABORTED')) {
      logger.warn('providers', 'login window load failed', msg);
    }
  });
  // Pętla pollingu (jak w youtube-auth): gdy pojawią się cookies sesyjne, zamknij okno
  // automatycznie; jeśli użytkownik zamknie okno wcześniej, wyjdź natychmiast. Podczas
  // logowania w popupie (Google) NIE zamykamy okna głównego — czekamy na zakończenie.
  const startedAt = Date.now();
  let stableCount = 0;
  let tokenCaptured = false;
  while (!closed && !win.isDestroyed()) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, LOGIN_POLL_MS);
      void closedPromise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (closed || win.isDestroyed()) break;

    if (Date.now() - startedAt > LOGIN_TIMEOUT_MS) {
      for (const bw of remainingPopups()) bw.destroy();
      if (!win.isDestroyed()) win.close();
      cleanupWindowTracking();
      return { success: false, error: 'Przekroczono czas logowania' };
    }

    if (remainingPopups().length > 0) {
      stableCount = 0;
      continue;
    }

    // PikPak i podobne: sesja w localStorage (access_token), nie w cookies.
    if (meta.authTokenKey) {
      const { accessToken, refreshToken } = await readAuthToken(win, meta.authTokenKey);
      if (accessToken) {
        await setProviderToken(providerId, accessToken);
        if (refreshToken) await setProviderRefresh(providerId, refreshToken);
        tokenCaptured = true;
        stableCount++;
        if (stableCount >= 2) {
          win.close();
          break;
        }
        continue;
      }
    }

    try {
      const current = await session.fromPartition(partition).cookies.get({});
      // Po zalogowaniu do Google (faza wstępna) przejdź do strony providera.
      if (!advancedToProvider && hasGoogleSession(current)) {
        advancedToProvider = true;
        void win.loadURL(meta.url).catch(() => {
          /* ignoruj */
        });
        continue;
      }
      if (hasSessionCookies(current, meta)) {
        stableCount++;
        if (stableCount >= 2) {
          win.close();
          break;
        }
      } else {
        stableCount = 0;
      }
    } catch {
      /* przejściowy błąd odczytu */
    }
  }

  // Po zamknięciu okna głównego poczekaj na ewentualne popupy (logowanie Google), ale nie
  // dłużej niż pozostały limit czasu logowania.
  const left = remainingPopups();
  if (left.length) {
    const remainingMs = Math.max(0, LOGIN_TIMEOUT_MS - (Date.now() - startedAt));
    await Promise.race([
      Promise.all(
        left.map(
          (bw) =>
            new Promise<void>((resolve) => {
              if (bw.isDestroyed()) resolve();
              else bw.once('closed', () => resolve());
            })
        )
      ),
      new Promise<void>((resolve) => setTimeout(resolve, remainingMs))
    ]);
  }
  cleanupWindowTracking();

  // Provider tokenowy (PikPak): sukces zależy od zapisanego tokenu, nie od cookies.
  if (meta.authTokenKey && tokenCaptured) return { success: true };

  let cookies: Electron.Cookie[] = [];
  try {
    cookies = await session.fromPartition(partition).cookies.get({});
  } catch (e) {
    logger.warn('providers', 'reading login cookies failed', e);
  }
  const filtered = filterDomainCookies(cookies, meta.domains);
  if (!filtered.length) return { success: false, canceled: true };

  const header = filtered.map((c) => `${c.name}=${c.value}`).join('; ');
  const ok = await setProviderCookie(providerId, header);
  return ok
    ? { success: true }
    : { success: false, error: 'Nie udało się zapisać cookie (brak keyringu)' };
}
