import { BrowserWindow, session } from 'electron';
import { readFile, unlink, copyFile } from 'fs/promises';
import { writeFileRestricted } from '../utils/file-permissions';
import { isValidCookieFile, type YtAuthConfig } from '../ipc/youtube/youtube-utils';
import type { YoutubeAuthMethod } from '../../shared/types/settings';
import { logger } from '../../shared/logger';
import { pipWindowIcon } from '../pip/pip-icon';
import { isValidCookieFileAt, hasSessionCookies, YT_COOKIE_HOST } from './youtube-auth-cookies';
import { getAuthSettings, setAuthSettings } from './youtube-auth-settings';
import {
  AUTH_PARTITION,
  cookiesFilePath,
  cookieFileHasValidYouTubeSession,
  exportSessionCookies,
  getSessionCookies,
  restorePartitionSession,
  writeTempSessionCookies
} from './youtube-auth-session';

export { cleanupYtAuthTemp } from './youtube-auth-session';

const LOGIN_POLL_MS = 1000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const LOGIN_DIAGNOSTIC_MS = 10 * 1000;
// Start na youtube.com sprawia, że Google przekierowuje do logowania w razie potrzeby,
// a potem z powrotem na youtube.com po zalogowaniu — więc cookies sesji .youtube.com,
// których yt-dlp faktycznie potrzebuje, są zawsze obecne przed eksportem.
const LOGIN_START_URL = 'https://www.youtube.com/';

let loginWindow: BrowserWindow | null = null;

// Otwiera wbudowane okno logowania Google przypisane do partycji auth. Rozwiązuje się
// przy sukcesie (cookies wyeksportowane + ustawienia zapisane), gdy użytkownik zamknie
// okno (anulowanie) lub przy timeout/błędzie.
export async function startGoogleLogin(): Promise<{
  success: boolean;
  canceled?: boolean;
  error?: string;
}> {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return { success: false, canceled: true, error: 'Login window already open' };
  }

  loginWindow = new BrowserWindow({
    width: 960,
    height: 720,
    autoHideMenuBar: true,
    title: 'Google Sign-In',
    backgroundColor: '#ffffff',
    icon: pipWindowIcon(),
    webPreferences: {
      partition: AUTH_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  const win = loginWindow;

  win.on('closed', () => {
    if (loginWindow === win) loginWindow = null;
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logger.warn('ytauth', 'login renderer gone', details.reason, details.exitCode);
  });

  // Odrzuca popupy bez ponownej nawigacji tego okna — wywołanie loadURL z handlera
  // popupa może zawiesić główny proces w Windows (a YouTube/Google czasem otwierają
  // popupy do własnego origin, co przerywa bieżące ładowanie).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Diagnostyka przepływu: loguj, które strony odwiedza okno logowania (tylko origin
  // + ścieżka — URL-e Google niosą tokeny w query stringu).
  const logUrl = (event: string, url: string): void => {
    try {
      const u = new URL(url);
      logger.info('ytauth', `login nav [${event}] ${u.origin}${u.pathname}`);
    } catch {
      // about:blank / URL-e data: nie są interesujące
    }
  };
  win.webContents.on('did-navigate', (_e, url) => logUrl('navigate', url));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => logUrl(`fail ${code} ${desc}`, url));

  // Google odrzuca domyślny user agent Electrona, więc zredukuj go do zwykłego
  // UA Chromium. Ustaw go na webContents (nie per-load), aby uniknąć crashu
  // renderera w Windows i zachować go we wszystkich nawigacjach.
  const ua = session.defaultSession.getUserAgent().replace(/Electron\/\S+\s*/, '');
  win.webContents.setUserAgent(ua);

  // Uruchom pętlę pollingu bez czekania na początkową nawigację: łańcuch
  // youtube.com → accounts.google.com odrzuca z ERR_ABORTED i w rzadkich
  // przypadkach `loadURL` nigdy się nie rozwiązuje — pętla musi działać niezależnie.
  void win.loadURL(LOGIN_START_URL).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('ERR_ABORTED')) {
      logger.warn('ytauth', 'login window load failed', msg);
    }
  });

  const startedAt = Date.now();
  let stableCount = 0;
  let lastDiagnosticAt = 0;
  while (loginWindow === win && !win.isDestroyed()) {
    // Liczą się tylko cookies sesji .youtube.com — cookies całego Google nie
    // wystarczą, aby yt-dlp odblokował treści z ograniczeniem wieku.
    const cookies = await getSessionCookies();
    if (hasSessionCookies(cookies, YT_COOKIE_HOST).length > 0) {
      stableCount++;
      if (stableCount >= 2 && (await exportSessionCookies())) {
        await setAuthSettings({
          method: 'electron',
          cookiesPath: cookiesFilePath(),
          lastLogin: Date.now()
        });
        win.close();
        return { success: true };
      }
    } else {
      stableCount = 0;
    }

    // Jedna linia diagnostyczna co 10 s podczas oczekiwania: gdzie jest przepływ i
    // które cookies z rodziny SID istnieją (tylko nazwy/domeny — nigdy wartości).
    if (Date.now() - lastDiagnosticAt > LOGIN_DIAGNOSTIC_MS) {
      lastDiagnosticAt = Date.now();
      const hint =
        cookies
          .filter((c) => /SID|APISID/i.test(c.name))
          .map((c) => `${c.name}@${c.domain ?? '?'}`)
          .slice(0, 8)
          .join(', ') || 'none';
      logger.info(
        'ytauth',
        `login poll url=${currentUrl(win)} cookies=${cookies.length} session=[${hint}]`
      );
    }

    if (Date.now() - startedAt > LOGIN_TIMEOUT_MS) {
      win.close();
      return { success: false, error: 'Login timed out' };
    }
    await new Promise((r) => setTimeout(r, LOGIN_POLL_MS));
  }

  return { success: false, canceled: true };
}

function currentUrl(win: BrowserWindow): string {
  try {
    const u = new URL(win.webContents.getURL());
    return `${u.origin}${u.pathname}`;
  } catch {
    return win.webContents.getURL() || '?';
  }
}

export async function logout(): Promise<void> {
  try {
    await session.fromPartition(AUTH_PARTITION).clearStorageData({ storages: ['cookies'] });
  } catch (e) {
    logger.warn('ytauth', 'session clear failed', e);
  }
  await unlink(cookiesFilePath()).catch(() => {
    /* best-effort */
  });
  await setAuthSettings({ method: 'none', cookiesPath: '', lastLogin: null });
}

export async function importCookiesFromFile(
  srcPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const content = await readFile(srcPath, 'utf-8');
    if (!isValidCookieFile(content)) {
      return { success: false, error: 'Invalid cookies file format (Netscape expected)' };
    }
    const eol = process.platform === 'win32' ? '\r\n' : '\n';
    await writeFileRestricted(cookiesFilePath(), content.replace(/\r?\n/g, eol));
    await setAuthSettings({
      method: 'manual',
      cookiesPath: cookiesFilePath(),
      lastLogin: Date.now()
    });
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('ytauth', 'importCookiesFromFile failed', msg);
    return { success: false, error: msg };
  }
}

export async function exportCookiesToFile(
  destPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await copyFile(cookiesFilePath(), destPath);
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('ytauth', 'exportCookiesToFile failed', msg);
    return { success: false, error: msg };
  }
}

export interface YoutubeAuthStatus {
  method: YoutubeAuthMethod;
  loggedIn: boolean;
  cookiesPath?: string;
  browser?: string;
  lastLogin?: number | null;
  error?: string;
}

export async function getAuthStatus(): Promise<YoutubeAuthStatus> {
  const settings = await getAuthSettings();
  const status: YoutubeAuthStatus = {
    method: settings.method,
    loggedIn: false,
    cookiesPath: settings.cookiesPath || undefined,
    browser: settings.cookiesBrowser || undefined,
    lastLogin: settings.lastLogin
  };
  try {
    if (settings.method === 'electron') {
      status.loggedIn = await exportSessionCookies();
      if (!status.loggedIn) {
        // Zimny start / utrata partycji — odbuduj żywą sesję z zapisanego
        // pliku, aby status był stabilny między restartami.
        await restorePartitionSession();
        status.loggedIn =
          (await exportSessionCookies()) || (await cookieFileHasValidYouTubeSession());
      }
    } else if (settings.method === 'manual') {
      status.loggedIn = await isValidCookieFileAt(settings.cookiesPath);
    } else if (settings.method === 'browser') {
      status.loggedIn = true;
    }
  } catch (e) {
    logger.warn('ytauth', 'getAuthStatus check failed', e);
    status.error = e instanceof Error ? e.message : String(e);
  }
  return status;
}

// Flagi auth dla każdego wywołania yt-dlp. Dla sesji wbudowanej zapisuje
// świeży, tymczasowy plik cookies (usuwany przez wywołującego przez cleanupYtAuthTemp),
// aby sesja nigdy nie została na dysku jako kopiowalny plik poza czasem procesu.
export async function getYtAuthConfig(): Promise<YtAuthConfig | null> {
  const settings = await getAuthSettings();
  if (settings.method === 'none') return null;
  if (settings.method === 'electron') {
    let tmpPath = await writeTempSessionCookies();
    if (!tmpPath) {
      // Partycja zgubiła żywą sesję — spróbuj przywrócić ją z zapisanego
      // pliku, a potem wyeksportuj ponownie.
      await restorePartitionSession();
      tmpPath = await writeTempSessionCookies();
    }
    return tmpPath ? { method: 'electron', cookiesPath: tmpPath, temp: true } : null;
  }
  if (settings.method === 'manual') {
    if (!(await isValidCookieFileAt(settings.cookiesPath))) return null;
    return { method: 'manual', cookiesPath: settings.cookiesPath };
  }
  if (settings.method === 'browser' && settings.cookiesBrowser) {
    return { method: 'browser', cookiesBrowser: settings.cookiesBrowser };
  }
  return null;
}

export function closeLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }
  loginWindow = null;
}
