import { BrowserWindow, session } from 'electron';
import { readFile, unlink, copyFile } from 'fs/promises';
import { writeFileRestricted } from './utils/file-permissions';
import { isValidCookieFile, type YtAuthConfig } from './ipc/youtube-utils';
import type { YoutubeAuthMethod } from '../renderer/src/types/settings';
import { logger } from '../shared/logger';
import { pipWindowIcon } from './pip-icon';
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
// Starting on youtube.com makes Google redirect to sign-in when needed and then
// back to youtube.com after login — so the .youtube.com session cookies that
// yt-dlp actually needs are always present before we export.
const LOGIN_START_URL = 'https://www.youtube.com/';

let loginWindow: BrowserWindow | null = null;

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

  // Deny popups without re-navigating this window — calling loadURL from the
  // popup handler can crash the main process on Windows (and YouTube/Google
  // occasionally open popups to their own origin, which aborts the current load).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Flow diagnostics: log which pages the login window visits (origin + path
  // only — Google URLs carry tokens in the query string).
  const logUrl = (event: string, url: string): void => {
    try {
      const u = new URL(url);
      logger.info('ytauth', `login nav [${event}] ${u.origin}${u.pathname}`);
    } catch {
      // about:blank / data: URLs are not interesting
    }
  };
  win.webContents.on('did-navigate', (_e, url) => logUrl('navigate', url));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => logUrl(`fail ${code} ${desc}`, url));

  // Google rejects Electron's default user agent, so strip it to a plain
  // Chromium UA. Set it on the webContents (not per-load) to avoid a renderer
  // crash on Windows and keep it across all navigations.
  const ua = session.defaultSession.getUserAgent().replace(/Electron\/\S+\s*/, '');
  win.webContents.setUserAgent(ua);

  // Start the poll loop without waiting for the initial navigation: the
  // youtube.com → accounts.google.com chain rejects with ERR_ABORTED and, in
  // rare cases, `loadURL` never settles — the loop must run regardless.
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
    // Only .youtube.com session cookies count — Google-wide cookies are not
    // enough for yt-dlp to unlock age-restricted content.
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

    // One diagnostic line every 10 s while waiting: where the flow is and which
    // SID-family cookies exist (names/domains only — never values).
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
