import { readFile } from 'fs/promises';
import { isValidCookieFile } from './ipc/youtube-utils';

// Cookies that mark a signed-in YouTube session. Google's login flow moves the
// SID-family around: a modern sign-in can leave `SID`/`HSID`/`__Secure-1PSID` on
// `.google.com` and set `__Secure-3PSID` (+ `LOGIN_INFO`) on `.youtube.com`.
// Accepting both variants (and `LOGIN_INFO`) avoids false "not logged in" states
// that keep the login window open forever.
export const SESSION_COOKIE_NAMES = [
  'SID',
  'HSID',
  '__Secure-1PSID',
  '__Secure-3PSID',
  'LOGIN_INFO'
];
export const YT_COOKIE_HOST = 'youtube.com';

export function cookieOnDomain(cookieDomain: string, host: string): boolean {
  return cookieDomain === host || cookieDomain === '.' + host || cookieDomain.endsWith('.' + host);
}

export function hasSessionCookies(cookies: Electron.Cookie[], host?: string): Electron.Cookie[] {
  return cookies.filter(
    (c) =>
      !!c.value &&
      (!host || cookieOnDomain(c.domain || '', host)) &&
      SESSION_COOKIE_NAMES.includes(c.name)
  );
}

export async function isValidCookieFileAt(path?: string): Promise<boolean> {
  if (!path) return false;
  try {
    const content = await readFile(path, 'utf-8');
    return isValidCookieFile(content);
  } catch {
    return false;
  }
}
