import { app, BrowserWindow, session } from 'electron';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { readFile, unlink, copyFile } from 'fs/promises';
import { getStore } from './ipc/cover-cache';
import { writeFileRestricted } from './utils/file-permissions';
import {
  serializeCookies,
  isValidCookieFile,
  parseNetscapeCookies,
  type YtAuthConfig
} from './ipc/youtube-utils';
import type { YoutubeAuthSettings, YoutubeAuthMethod } from '../renderer/src/types/settings';
import { logger } from '../shared/logger';

// Dedicated persistent partition so the Google session survives restarts and
// stays fully isolated from the app's own session.
const AUTH_PARTITION = 'persist:youtube-auth';
const COOKIES_FILE = 'youtube-cookies.txt';
const LOGIN_POLL_MS = 1000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const SESSION_COOKIE_NAMES = ['SID', 'HSID', '__Secure-1PSID'];
// Starting on youtube.com makes Google redirect to sign-in when needed and then
// back to youtube.com after login — so the .youtube.com session cookies that
// yt-dlp actually needs are always present before we export.
const LOGIN_START_URL = 'https://www.youtube.com/';
const YT_COOKIE_HOST = 'youtube.com';

let loginWindow: BrowserWindow | null = null;

function cookiesFilePath(): string {
  return join(app.getPath('userData'), COOKIES_FILE);
}

async function getAuthSettings(): Promise<YoutubeAuthSettings> {
  try {
    const store = await getStore();
    const raw = store.get('youtube') as Partial<YoutubeAuthSettings> | undefined;
    const method: YoutubeAuthMethod =
      raw?.method === 'electron' || raw?.method === 'browser' || raw?.method === 'manual'
        ? raw.method
        : 'none';
    return {
      method,
      cookiesPath: typeof raw?.cookiesPath === 'string' ? raw.cookiesPath : '',
      cookiesBrowser: typeof raw?.cookiesBrowser === 'string' ? raw.cookiesBrowser : 'chrome',
      lastLogin: typeof raw?.lastLogin === 'number' ? raw.lastLogin : null
    };
  } catch (e) {
    logger.warn('ytauth', 'getAuthSettings failed', e);
    return { method: 'none', cookiesPath: '', cookiesBrowser: 'chrome', lastLogin: null };
  }
}

async function setAuthSettings(partial: Partial<YoutubeAuthSettings>): Promise<void> {
  try {
    const store = await getStore();
    const current = await getAuthSettings();
    store.set('youtube', { ...current, ...partial });
  } catch (e) {
    logger.warn('ytauth', 'setAuthSettings failed', e);
  }
}

function cookieOnDomain(cookieDomain: string, host: string): boolean {
  return cookieDomain === host || cookieDomain === '.' + host || cookieDomain.endsWith('.' + host);
}

function hasSessionCookies(cookies: Electron.Cookie[], host?: string): Electron.Cookie[] {
  return cookies.filter(
    (c) =>
      !!c.value &&
      (!host || cookieOnDomain(c.domain || '', host)) &&
      SESSION_COOKIE_NAMES.includes(c.name)
  );
}

// A signed-in YouTube session is present when .youtube.com carries one of the
// SID-family cookies. This is the exact condition yt-dlp needs to pass age gates.
async function hasYouTubeSession(): Promise<boolean> {
  await ensureSessionLoaded();
  const cookies = await session.fromPartition(AUTH_PARTITION).cookies.get({});
  return hasSessionCookies(cookies, YT_COOKIE_HOST).length > 0;
}

// Electron only opens the persistent partition's cookie store once a webContents
// actually uses that partition. Until then session.cookies.get({}) returns an
// empty list, so right after a restart the app reports "not logged in" even
// though the session survived on disk. Loading a hidden about:blank page on the
// auth partition forces the store to hydrate so the cookies API sees it.
//
// The hidden window is only created when the persisted cookie file (source of
// truth) actually holds a session — with nothing to hydrate a window would just
// be created and destroyed at startup, churning with the splash/main windows
// and emitting blink.mojom.WidgetHost rejection noise. During a login the
// visible login window itself hydrates the same partition, so the guard never
// blocks session detection there.
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

// Re-seeds the auth partition from the persisted cookie file. The exported file
// is the source of truth (yt-dlp reads it) and survives restarts even when the
// Chromium partition store does not hydrate in time — without a live session the
// app would log "no .youtube.com session cookies" on every yt-dlp call while
// still working through the file fallback. After a successful restore the next
// exportSessionCookies() re-writes a fresh file from the live partition.
async function restorePartitionSession(): Promise<boolean> {
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
        // Individual cookies can be rejected; the SID-family ones are what matter.
      }
    }
    try {
      ses.cookies.flushStore();
    } catch {
      // flushStore is unavailable in older Electron — cookies still persist.
    }
    return hasSessionCookies(await ses.cookies.get({}), YT_COOKIE_HOST).length > 0;
  } catch (e) {
    logger.warn('ytauth', 'restorePartitionSession failed', e);
    return false;
  }
}

// Serializes the live .youtube.com session cookies from the auth partition into
// a Netscape cookie string, or returns null when no session is present.
async function serializedSessionCookies(): Promise<string | null> {
  await ensureSessionLoaded();
  const cookies = await session.fromPartition(AUTH_PARTITION).cookies.get({});
  if (hasSessionCookies(cookies, YT_COOKIE_HOST).length === 0) {
    logger.warn('ytauth', 'export skipped — no .youtube.com session cookies');
    return null;
  }
  const eol = process.platform === 'win32' ? '\r\n' : '\n';
  return serializeCookies(cookies, eol);
}

// Re-exports the persisted session to the Netscape cookie file that survives
// restarts (source of truth for the auth partition hydration). Written with
// 0600 (POSIX) / current-user-only ACL (Windows) so it is not world-readable.
async function exportSessionCookies(): Promise<boolean> {
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

// Writes the live session to a temporary file for a single yt-dlp process. The
// caller owns the file and must delete it via cleanupYtAuthTemp() when done —
// the session never lingers as a copyable file beyond the process lifetime.
async function writeTempSessionCookies(): Promise<string | null> {
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

// Deletes a temporary cookie file created by writeTempSessionCookies. Safe to
// call with any auth config — only files flagged as temporary are removed.
export async function cleanupYtAuthTemp(auth?: YtAuthConfig | null): Promise<void> {
  if (!auth || !auth.temp || !auth.cookiesPath) return;
  await unlink(auth.cookiesPath).catch(() => {});
}

async function isValidCookieFileAt(path?: string): Promise<boolean> {
  if (!path) return false;
  try {
    const content = await readFile(path, 'utf-8');
    return isValidCookieFile(content);
  } catch {
    return false;
  }
}

// Fallback for the "electron" method: if the partition's cookie store is not
// readable yet (cold start), report the persisted Netscape file as valid as long
// as it still carries an unexpired .youtube.com SID-family cookie.
async function cookieFileHasValidYouTubeSession(): Promise<boolean> {
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

// Opens an in-app Google login window bound to the auth partition. Resolves on
// success (cookies exported + settings persisted), when the user closes the
// window (canceled) or on timeout/error.
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

  // Deny popups without re-navigating this window — calling loadURL from the
  // popup handler can crash the main process on Windows (and YouTube/Google
  // occasionally open popups to their own origin, which aborts the current load).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Google rejects Electron's default user agent, so strip it to a plain
  // Chromium UA. Set it on the webContents (not per-load) to avoid a renderer
  // crash on Windows and keep it across all navigations.
  const ua = session.defaultSession.getUserAgent().replace(/Electron\/\S+\s*/, '');
  win.webContents.setUserAgent(ua);

  // Loading youtube.com redirects to Google sign-in when the session is not
  // authenticated and returns here after login — so the .youtube.com session
  // cookies are set by the time we detect them.
  try {
    await win.loadURL(LOGIN_START_URL);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // ERR_ABORTED fires on redirects (youtube.com -> accounts.google.com and
    // back) and is not fatal — the polling loop still detects the login.
    if (!msg.includes('ERR_ABORTED')) {
      logger.warn('ytauth', 'login window load failed', msg);
    }
  }

  const startedAt = Date.now();
  let stableCount = 0;
  while (loginWindow === win && !win.isDestroyed()) {
    // Only .youtube.com session cookies count — Google-wide cookies are not
    // enough for yt-dlp to unlock age-restricted content.
    if (await hasYouTubeSession()) {
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
    if (Date.now() - startedAt > LOGIN_TIMEOUT_MS) {
      win.close();
      return { success: false, error: 'Login timed out' };
    }
    await new Promise((r) => setTimeout(r, LOGIN_POLL_MS));
  }

  return { success: false, canceled: true };
}

export async function logout(): Promise<void> {
  try {
    await session.fromPartition(AUTH_PARTITION).clearStorageData({ storages: ['cookies'] });
  } catch (e) {
    logger.warn('ytauth', 'session clear failed', e);
  }
  await unlink(cookiesFilePath()).catch(() => {});
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
        // Cold start / partition loss — rebuild the live session from the
        // persisted file so the status is stable across restarts.
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

// Auth flags for every yt-dlp invocation. For the in-app session this writes a
// fresh, temporary cookie file (deleted by the caller via cleanupYtAuthTemp)
// so the session is never left as a copyable file on disk beyond the process.
export async function getYtAuthConfig(): Promise<YtAuthConfig | null> {
  const settings = await getAuthSettings();
  if (settings.method === 'none') return null;
  if (settings.method === 'electron') {
    let tmpPath = await writeTempSessionCookies();
    if (!tmpPath) {
      // The partition lost the live session — try to bring it back from the
      // persisted file, then export again.
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
