import { beforeEach, describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isValidCookieFile: vi.fn(() => false),
  readFile: vi.fn()
}));

vi.mock('../ipc/youtube/youtube-utils', () => ({
  isValidCookieFile: h.isValidCookieFile
}));
vi.mock('fs/promises', () => ({ readFile: h.readFile }));

import {
  SESSION_COOKIE_NAMES,
  cookieOnDomain,
  hasSessionCookies,
  isValidCookieFileAt
} from '../youtube/youtube-auth-cookies';

function cookie(name: string, domain: string, value = 'v'): Electron.Cookie {
  return { name, value, domain, sameSite: 'no_restriction' };
}

describe('cookieOnDomain', () => {
  it('matches the host, its dot-domain and subdomains only', () => {
    expect(cookieOnDomain('youtube.com', 'youtube.com')).toBe(true);
    expect(cookieOnDomain('.youtube.com', 'youtube.com')).toBe(true);
    expect(cookieOnDomain('www.youtube.com', 'youtube.com')).toBe(true);
    expect(cookieOnDomain('.google.com', 'youtube.com')).toBe(false);
    expect(cookieOnDomain('notyoutube.com', 'youtube.com')).toBe(false);
    expect(cookieOnDomain('', 'youtube.com')).toBe(false);
  });
});

describe('hasSessionCookies', () => {
  it('accepts the classic SID session on .youtube.com', () => {
    const cookies = [cookie('SID', '.youtube.com'), cookie('PREF', '.youtube.com')];
    expect(hasSessionCookies(cookies, 'youtube.com').map((c) => c.name)).toEqual(['SID']);
  });

  it('accepts the modern layout: __Secure-3PSID + LOGIN_INFO on .youtube.com', () => {
    const cookies = [
      cookie('__Secure-3PSID', '.youtube.com'),
      cookie('__Secure-3PSIDTS', '.youtube.com'),
      cookie('LOGIN_INFO', '.youtube.com'),
      cookie('__Secure-YEC', '.youtube.com')
    ];
    expect(hasSessionCookies(cookies, 'youtube.com').map((c) => c.name)).toEqual([
      '__Secure-3PSID',
      'LOGIN_INFO'
    ]);
  });

  it('ignores Google-only SID cookies (wrong host for yt-dlp)', () => {
    const cookies = [cookie('SID', '.google.com'), cookie('__Secure-1PSID', '.google.com')];
    expect(hasSessionCookies(cookies, 'youtube.com')).toHaveLength(0);
  });

  it('ignores logged-out YouTube cookies and empty values', () => {
    const cookies = [
      cookie('__Secure-YEC', '.youtube.com'),
      cookie('VISITOR_INFO1_LIVE', '.youtube.com'),
      cookie('SID', '.youtube.com', '')
    ];
    expect(hasSessionCookies(cookies, 'youtube.com')).toHaveLength(0);
  });

  it('ignores entries without a cookie domain when a host is required', () => {
    const cookieWithoutDomain = { name: 'SID', value: 'v', sameSite: 'no_restriction' } as never;

    expect(hasSessionCookies([cookieWithoutDomain], 'youtube.com')).toHaveLength(0);
    expect(hasSessionCookies([cookieWithoutDomain])).toHaveLength(1);
  });

  it('exposes the SID-family names used for detection', () => {
    expect(SESSION_COOKIE_NAMES).toContain('__Secure-3PSID');
    expect(SESSION_COOKIE_NAMES).toContain('LOGIN_INFO');
  });
});

beforeEach(() => {
  h.isValidCookieFile.mockReset().mockReturnValue(false);
  h.readFile.mockReset().mockResolvedValue('cookie-content');
});

describe('isValidCookieFileAt', () => {
  it('rejects a missing path without reading', async () => {
    await expect(isValidCookieFileAt(undefined)).resolves.toBe(false);
    await expect(isValidCookieFileAt('')).resolves.toBe(false);
    expect(h.readFile).not.toHaveBeenCalled();
  });

  it('reads and validates the file contents', async () => {
    h.isValidCookieFile.mockReturnValue(true);

    await expect(isValidCookieFileAt('D:/cookies.txt')).resolves.toBe(true);
    expect(h.readFile).toHaveBeenCalledWith('D:/cookies.txt', 'utf-8');
    expect(h.isValidCookieFile).toHaveBeenCalledWith('cookie-content');
  });

  it('returns false for invalid contents', async () => {
    await expect(isValidCookieFileAt('D:/cookies.txt')).resolves.toBe(false);
  });

  it('swallows read failures', async () => {
    h.readFile.mockRejectedValue(new Error('ENOENT'));

    await expect(isValidCookieFileAt('D:/missing.txt')).resolves.toBe(false);
  });
});
