import { describe, it, expect, vi } from 'vitest';

vi.mock('../ipc/youtube-utils', () => ({ isValidCookieFile: () => false }));

import { SESSION_COOKIE_NAMES, cookieOnDomain, hasSessionCookies } from '../youtube-auth-cookies';

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

  it('exposes the SID-family names used for detection', () => {
    expect(SESSION_COOKIE_NAMES).toContain('__Secure-3PSID');
    expect(SESSION_COOKIE_NAMES).toContain('LOGIN_INFO');
  });
});
