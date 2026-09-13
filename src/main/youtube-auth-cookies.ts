import { readFile } from 'fs/promises';
import { isValidCookieFile } from './ipc/youtube-utils';

export const SESSION_COOKIE_NAMES = ['SID', 'HSID', '__Secure-1PSID'];
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
