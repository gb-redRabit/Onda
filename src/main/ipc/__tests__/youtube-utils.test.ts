import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatUploadDate,
  pickThumbnail,
  buildYtArgs,
  serializeCookies,
  isValidCookieFile,
  detectJsRuntime
} from '../youtube-utils';

describe('formatDuration', () => {
  it('returns undefined for missing/zero/negative duration', () => {
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(0)).toBeUndefined();
    expect(formatDuration(-5)).toBeUndefined();
  });

  it('formats under one hour as m:ss', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats over one hour as h:mm:ss', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(3723)).toBe('1:02:03');
  });
});

describe('formatUploadDate', () => {
  it('converts YYYYMMDD to YYYY-MM-DD', () => {
    expect(formatUploadDate('20240315')).toBe('2024-03-15');
    expect(formatUploadDate('20260101')).toBe('2026-01-01');
  });

  it('returns empty string for invalid input', () => {
    expect(formatUploadDate(undefined)).toBe('');
    expect(formatUploadDate('')).toBe('');
    expect(formatUploadDate('2024-03-15')).toBe('');
    expect(formatUploadDate('2024315')).toBe('');
  });
});

describe('pickThumbnail', () => {
  it('picks the largest width thumbnail', () => {
    const entry = {
      id: 'abc123',
      thumbnails: [
        { url: 'https://img/small', width: 100 },
        { url: 'https://img/large', width: 1280 },
        { url: 'https://img/medium', width: 480 }
      ]
    };
    expect(pickThumbnail(entry)).toBe('https://img/large');
  });

  it('falls back to i.ytimg.com when no thumbnails present', () => {
    expect(pickThumbnail({ id: 'abc123' })).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('returns empty string when no id and no thumbnails', () => {
    expect(pickThumbnail({})).toBe('');
  });

  it('ignores thumbnails without url', () => {
    const entry = { id: 'abc', thumbnails: [{ width: 720 }, { url: '', width: 1280 }] };
    expect(pickThumbnail(entry)).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
  });
});

describe('detectJsRuntime', () => {
  const probe = (p: string) =>
    p === 'C:\\Program Files\\nodejs\\node.exe' || p === '/usr/bin/node';

  it('prefers the npm node executable', () => {
    const env = {
      npm_node_execpath: 'C:\\Program Files\\nodejs\\node.exe',
      PATH: ''
    } as NodeJS.ProcessEnv;
    expect(detectJsRuntime(env, probe, 'win32')).toBe('C:\\Program Files\\nodejs\\node.exe');
  });

  it('scans PATH directories for the node binary', () => {
    const env = {
      PATH: 'C:\\other;C:\\Program Files\\nodejs'
    } as NodeJS.ProcessEnv;
    expect(detectJsRuntime(env, probe, 'win32')).toBe('C:\\Program Files\\nodejs\\node.exe');
  });

  it('checks common Windows install locations as a fallback', () => {
    const env = {
      PATH: '',
      ProgramFiles: 'C:\\Program Files',
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
      SystemRoot: 'C:\\Windows'
    } as NodeJS.ProcessEnv;
    expect(detectJsRuntime(env, probe, 'win32')).toBe('C:\\Program Files\\nodejs\\node.exe');
  });

  it('returns null when no runtime is found', () => {
    expect(
      detectJsRuntime({ PATH: 'C:\\nothing', ProgramFiles: 'C:\\none' } as NodeJS.ProcessEnv, () => false, 'win32')
    ).toBe(null);
  });
});

describe('buildYtArgs', () => {
  const base = ['ytsearch5:test', '-J'];

  it('leaves args unchanged when auth is disabled and no runtime', () => {
    expect(buildYtArgs(base, { method: 'none' }, null)).toEqual(base);
    expect(buildYtArgs(base, null, null)).toEqual(base);
    expect(buildYtArgs(base, undefined, null)).toEqual(base);
  });

  it('injects --cookies for electron/manual methods', () => {
    expect(buildYtArgs(base, { method: 'electron', cookiesPath: 'C:\\a\\c.txt' }, null)).toEqual([
      ...base,
      '--cookies',
      'C:\\a\\c.txt'
    ]);
    expect(buildYtArgs(base, { method: 'manual', cookiesPath: '/tmp/c.txt' }, null)).toEqual([
      ...base,
      '--cookies',
      '/tmp/c.txt'
    ]);
  });

  it('injects --cookies-from-browser for the browser method', () => {
    expect(buildYtArgs(base, { method: 'browser', cookiesBrowser: 'edge' }, null)).toEqual([
      ...base,
      '--cookies-from-browser',
      'edge'
    ]);
  });

  it('skips browser arg when no browser is configured', () => {
    expect(buildYtArgs(base, { method: 'browser' }, null)).toEqual(base);
  });

  it('injects the JS runtime when one is available', () => {
    expect(buildYtArgs(base, null, 'C:\\Program Files\\nodejs\\node.exe')).toEqual([
      ...base,
      '--js-runtimes',
      'node:C:\\Program Files\\nodejs\\node.exe'
    ]);
  });

  it('combines cookies and the JS runtime', () => {
    expect(buildYtArgs(base, { method: 'manual', cookiesPath: '/tmp/c.txt' }, '/usr/bin/node')).toEqual([
      ...base,
      '--cookies',
      '/tmp/c.txt',
      '--js-runtimes',
      'node:/usr/bin/node'
    ]);
  });

  it('does not duplicate a caller-provided --js-runtimes flag', () => {
    expect(buildYtArgs([...base, '--js-runtimes', 'node:x'], null, '/usr/bin/node')).toEqual([
      ...base,
      '--js-runtimes',
      'node:x'
    ]);
  });
});

describe('serializeCookies', () => {
  const cookie = {
    name: 'SID',
    value: 'abc',
    domain: '.youtube.com',
    hostOnly: false,
    path: '/',
    secure: true,
    expirationDate: 1710000000
  };

  it('produces a Netscape-formatted line', () => {
    const out = serializeCookies([cookie]);
    expect(out).toContain('# Netscape HTTP Cookie File');
    expect(out).toContain('.youtube.com\tTRUE\t/\tTRUE\t1710000000\tSID\tabc');
  });

  it('adds a leading dot for non-host-only domains', () => {
    const out = serializeCookies([{ ...cookie, domain: 'youtube.com', hostOnly: false }]);
    expect(out).toContain('.youtube.com\tTRUE');
  });

  it('keeps host-only cookies without subdomains', () => {
    const out = serializeCookies([{ ...cookie, domain: 'accounts.google.com', hostOnly: true }]);
    expect(out).toContain('accounts.google.com\tFALSE\t/\tTRUE\t1710000000\tSID\tabc');
  });

  it('uses 0 expiry for session cookies and FALSE for insecure', () => {
    const out = serializeCookies([{ ...cookie, expirationDate: undefined, secure: false }]);
    expect(out).toContain('/\tFALSE\t0\tSID\tabc');
  });

  it('honours a custom EOL for Windows CRLF', () => {
    const out = serializeCookies([cookie, cookie], '\r\n');
    expect(out.split('\r\n').length).toBe(3);
    expect(out).not.toContain('\n\t');
  });

  it('strips tabs and newlines from names and values', () => {
    const out = serializeCookies([{ ...cookie, name: 'na\tme', value: 'va\r\nlue' }]);
    expect(out).toContain('name\tvalue');
  });
});

describe('isValidCookieFile', () => {
  it('accepts a valid Netscape file', () => {
    const content = '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\n';
    expect(isValidCookieFile(content)).toBe(true);
  });

  it('accepts CRLF line endings', () => {
    const content = '.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\r\n';
    expect(isValidCookieFile(content)).toBe(true);
  });

  it('rejects files with malformed rows', () => {
    expect(isValidCookieFile('# only a comment\n')).toBe(false);
    expect(isValidCookieFile('.youtube.com\tTRUE\t/')).toBe(false);
  });
});
