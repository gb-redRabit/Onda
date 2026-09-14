import { app, BrowserWindow, session } from 'electron';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import { writeFileRestricted } from './utils/file-permissions';
import { serializeCookies, parseNetscapeCookies, type YtAuthConfig } from './ipc/youtube-utils';
import { logger } from '../shared/logger';
import {
  SESSION_COOKIE_NAMES,
  YT_COOKIE_HOST,
  cookieOnDomain,
  hasSessionCookies
} from './youtube-auth-cookies';

// Dedicated persistent partition so the Google session survives restarts and
// stays fully isolated from the app's own session.
export const AUTH_PARTITION = 'persist:youtube-auth';
const COOKIES_FILE = 'youtube-cookies.txt';

export function cookiesFilePath(): string {
  return join(app.getPath('userData'), COOKIES_FILE);
}

// A signed-in YouTube session is present when .youtube.com carries one of the
// SID-family cookies. This is the exact condition yt-dlp needs to pass age gates.
export async function hasYouTubeSession(): Promise<boolean> {
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

// Writes the live session to a temporary file for a single yt-dlp process. The
// caller owns the file and must delete it via cleanupYtAuthTemp() when done —
// the session never lingers as a copyable file beyond the process lifetime.
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

// Deletes a temporary cookie file created by writeTempSessionCookies. Safe to
// call with any auth config — only files flagged as temporary are removed.
export async function cleanupYtAuthTemp(auth?: YtAuthConfig | null): Promise<void> {
  if (!auth || !auth.temp || !auth.cookiesPath) return;
  await unlink(auth.cookiesPath).catch(() => {});
}

// Fallback for the "electron" method: if the partition's cookie store is not
// readable yet (cold start), report the persisted Netscape file as valid as long
// as it still carries an unexpired .youtube.com SID-family cookie.
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
