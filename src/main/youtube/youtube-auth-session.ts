import { app, BrowserWindow, session } from 'electron';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import { writeFileRestricted } from '../utils/file-permissions';
import {
  serializeCookies,
  parseNetscapeCookies,
  type YtAuthConfig
} from '../ipc/youtube/youtube-utils';
import { logger } from '../../shared/logger';
import {
  SESSION_COOKIE_NAMES,
  YT_COOKIE_HOST,
  cookieOnDomain,
  hasSessionCookies
} from './youtube-auth-cookies';

// Dedykowana trwała partycja, aby sesja Google przetrwała restarty i pozostawała
// w pełni odizolowana od własnej sesji aplikacji.
export const AUTH_PARTITION = 'persist:youtube-auth';
const COOKIES_FILE = 'youtube-cookies.txt';

export function cookiesFilePath(): string {
  return join(app.getPath('userData'), COOKIES_FILE);
}

// Snapshot cookies partycji auth. Niefiltrowane `get({})` jest głównym źródłem;
// zapytanie ograniczone do URL jest scalane jako siatka bezpieczeństwa (utrzymuje
// też magazyn cookies nawodnionym na potrzeby pollingu logowania).
export async function getSessionCookies(): Promise<Electron.Cookie[]> {
  await ensureSessionLoaded();
  const ses = session.fromPartition(AUTH_PARTITION);
  const [all, youtube] = await Promise.all([
    ses.cookies.get({}),
    ses.cookies.get({ url: 'https://www.youtube.com' })
  ]);
  const seen = new Set<string>();
  const merged: Electron.Cookie[] = [];
  for (const cookie of [...all, ...youtube]) {
    const key = `${cookie.name}|${cookie.domain ?? ''}|${cookie.path ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(cookie);
  }
  return merged;
}

// Electron otwiera magazyn cookies trwałej partycji dopiero, gdy jakiś webContents
// faktycznie użyje tej partycji. Do tego czasu session.cookies.get({}) zwraca
// pustą listę, więc zaraz po restarcie aplikacja zgłasza "not logged in", mimo że
// sesja przetrwała na dysku. Wczytanie ukrytej strony about:blank na partycji auth
// wymusza nawodnienie magazynu, aby API cookies go widziało.
//
// Ukryte okno jest tworzone tylko wtedy, gdy zapisany plik cookies (źródło prawdy)
// faktycznie zawiera sesję — bez niczego do nawodnienia okno byłoby po prostu
// tworzone i niszczone przy starcie, mieszając się z oknami splash/main i emitując
// szum odrzuceń blink.mojom.WidgetHost. Podczas logowania samo widoczne okno
// logowania nawadnia tę samą partycję, więc guard nigdy nie blokuje tam detekcji sesji.
let sessionWarmPromise: Promise<void> | null = null;
async function ensureSessionLoaded(): Promise<void> {
  if (!(await cookieFileHasValidYouTubeSession())) return;
  if (!sessionWarmPromise) {
    sessionWarmPromise = (async () => {
      const win = new BrowserWindow({
        show: false,
        webPreferences: { partition: AUTH_PARTITION, sandbox: true }
      });
      try {
        await win.loadURL('about:blank');
      } catch (e) {
        logger.warn('ytauth', 'session warm-up failed', e);
      } finally {
        if (!win.isDestroyed()) win.destroy();
      }
    })();
  }
  await sessionWarmPromise;
}

// Ponownie zasiewa partycję auth z zapisanego pliku cookies. Wyeksportowany plik
// jest źródłem prawdy (yt-dlp go czyta) i przetrwa restarty nawet, gdy magazyn
// partycji Chromium nie nawodni się na czas — bez żywej sesji aplikacja logowałaby
// "no .youtube.com session cookies" przy każdym wywołaniu yt-dlp, działając dalej
// przez fallback plikowy. Po udanym przywróceniu następne
// exportSessionCookies() przepisuje świeży plik z żywej partycji.
export async function restorePartitionSession(): Promise<boolean> {
  try {
    await ensureSessionLoaded();
    const ses = session.fromPartition(AUTH_PARTITION);
    if (hasSessionCookies(await ses.cookies.get({}), YT_COOKIE_HOST).length > 0) return true;
    if (!(await cookieFileHasValidYouTubeSession())) return false;
    const content = await readFile(cookiesFilePath(), 'utf-8');
    for (const cookie of parseNetscapeCookies(content)) {
      try {
        await ses.cookies.set({
          url: cookie.url,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path,
          secure: cookie.secure,
          ...(cookie.domain ? { domain: cookie.domain } : {}),
          ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {})
        });
      } catch {
        // Pojedyncze cookies mogą zostać odrzucone; liczą się te z rodziny SID.
      }
    }
    try {
      ses.cookies.flushStore();
    } catch {
      // flushStore jest niedostępne w starszym Electronie — cookies i tak się zapisują.
    }
    return hasSessionCookies(await ses.cookies.get({}), YT_COOKIE_HOST).length > 0;
  } catch (e) {
    logger.warn('ytauth', 'restorePartitionSession failed', e);
    return false;
  }
}

// Serializuje żywe cookies sesji .youtube.com z partycji auth do
// stringa cookies Netscape lub zwraca null, gdy nie ma sesji.
async function serializedSessionCookies(): Promise<string | null> {
  const cookies = await getSessionCookies();
  if (hasSessionCookies(cookies, YT_COOKIE_HOST).length === 0) {
    logger.warn('ytauth', 'export skipped — no .youtube.com session cookies');
    return null;
  }
  const eol = process.platform === 'win32' ? '\r\n' : '\n';
  return serializeCookies(cookies, eol);
}

// Ponownie eksportuje zapisaną sesję do pliku cookies Netscape, który przetrwa
// restarty (źródło prawdy dla nawodnienia partycji auth). Zapisywany z
// 0600 (POSIX) / ACL tylko dla bieżącego użytkownika (Windows), więc nie jest publicznie czytelny.
export async function exportSessionCookies(): Promise<boolean> {
  try {
    const content = await serializedSessionCookies();
    if (content === null) return false;
    await writeFileRestricted(cookiesFilePath(), content);
    logger.info('ytauth', 'cookies exported');
    return true;
  } catch (e) {
    logger.warn('ytauth', 'exportSessionCookies failed', e);
    return false;
  }
}

// Zapisuje żywą sesję do pliku tymczasowego dla pojedynczego procesu yt-dlp.
// Wywołujący jest właścicielem pliku i musi go usunąć przez cleanupYtAuthTemp() —
// sesja nigdy nie zalega jako kopiowalny plik poza czasem życia procesu.
export async function writeTempSessionCookies(): Promise<string | null> {
  try {
    const content = await serializedSessionCookies();
    if (content === null) return null;
    const tmpPath = join(app.getPath('temp'), `onda-yt-cookies-${randomUUID()}.txt`);
    await writeFileRestricted(tmpPath, content);
    return tmpPath;
  } catch (e) {
    logger.warn('ytauth', 'writeTempSessionCookies failed', e);
    return null;
  }
}

// Usuwa tymczasowy plik cookies utworzony przez writeTempSessionCookies. Bezpieczne
// do wywołania z dowolną konfiguracją auth — usuwane są tylko pliki oznaczone jako tymczasowe.
export async function cleanupYtAuthTemp(auth?: YtAuthConfig | null): Promise<void> {
  if (!auth || !auth.temp || !auth.cookiesPath) return;
  await unlink(auth.cookiesPath).catch(() => {});
}

// Fallback dla metody "electron": jeśli magazyn cookies partycji nie jest jeszcze
// czytelny (zimny start), zgłoś zapisany plik Netscape jako ważny, dopóki
// nadal niesie niewygasłe cookie z rodziny SID dla .youtube.com.
export async function cookieFileHasValidYouTubeSession(): Promise<boolean> {
  try {
    const content = await readFile(cookiesFilePath(), 'utf-8');
    const now = Math.floor(Date.now() / 1000);
    return content.split(/\r?\n/).some((line) => {
      const parts = line.split('\t');
      if (parts.length < 7) return false;
      const expiry = parseInt(parts[4], 10);
      return (
        cookieOnDomain(parts[0] || '', YT_COOKIE_HOST) &&
        SESSION_COOKIE_NAMES.includes(parts[5] || '') &&
        (expiry === 0 || expiry > now)
      );
    });
  } catch {
    return false;
  }
}
