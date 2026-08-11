import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatUploadDate,
  pickThumbnail,
  buildYtArgs,
  serializeCookies,
  isValidCookieFile,
  detectJsRuntime,
  detectYtKind,
  normalizeYtUrl,
  mapResolvedEntry,
  mapResolvedContainer,
  mapVideoEntry,
  pickChannelThumbnail
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
  const probe = (p: string) => p === 'C:\\Program Files\\nodejs\\node.exe' || p === '/usr/bin/node';

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
      detectJsRuntime(
        { PATH: 'C:\\nothing', ProgramFiles: 'C:\\none' } as NodeJS.ProcessEnv,
        () => false,
        'win32'
      )
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
    expect(
      buildYtArgs(base, { method: 'manual', cookiesPath: '/tmp/c.txt' }, '/usr/bin/node')
    ).toEqual([...base, '--cookies', '/tmp/c.txt', '--js-runtimes', 'node:/usr/bin/node']);
  });

  it('does not duplicate a caller-provided --js-runtimes flag', () => {
    expect(buildYtArgs([...base, '--js-runtimes', 'node:x'], null, '/usr/bin/node')).toEqual([
      ...base,
      '--js-runtimes',
      'node:x'
    ]);
  });
});

describe('detectYtKind', () => {
  it('classifies plain video URLs', () => {
    expect(detectYtKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('video');
    expect(detectYtKind('https://youtu.be/dQw4w9WgXcQ')).toBe('video');
    expect(detectYtKind('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('video');
    expect(detectYtKind('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('video');
    expect(detectYtKind('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('video');
  });

  it('classifies video URLs on m./music. subdomains', () => {
    expect(detectYtKind('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('video');
    expect(detectYtKind('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('video');
  });

  it('classifies playlist URLs', () => {
    expect(detectYtKind('https://www.youtube.com/playlist?list=PL123')).toBe('playlist');
    expect(detectYtKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123')).toBe('playlist');
  });

  it('classifies channel URLs', () => {
    expect(detectYtKind('https://www.youtube.com/@SomeChannel')).toBe('channel');
    expect(detectYtKind('https://www.youtube.com/@SomeChannel/videos')).toBe('channel');
    expect(detectYtKind('https://www.youtube.com/channel/UCabc')).toBe('channel');
    expect(detectYtKind('https://www.youtube.com/c/SomeChannel')).toBe('channel');
    expect(detectYtKind('https://www.youtube.com/user/someuser')).toBe('channel');
  });

  it('classifies a bare video ID', () => {
    expect(detectYtKind('LpNVf8sczqU')).toBe('video');
  });

  it('classifies a channel handle with the leading @', () => {
    expect(detectYtKind('@MrMoMMusic')).toBe('channel');
    expect(detectYtKind('@some_channel.2024')).toBe('channel');
  });

  it('does not classify a bare name without @ as a channel', () => {
    expect(detectYtKind('MrMoMMusic')).toBeNull();
    expect(detectYtKind('some_channel')).toBeNull();
  });

  it('returns null for non-YouTube or malformed input', () => {
    expect(detectYtKind('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(detectYtKind('https://google.com/playlist?list=PL123')).toBeNull();
    expect(detectYtKind('not a url')).toBeNull();
    expect(detectYtKind('')).toBeNull();
    expect(detectYtKind('https://www.youtube.com/feed/subscriptions')).toBeNull();
  });
});

describe('normalizeYtUrl', () => {
  it('turns a bare video ID into a watch URL', () => {
    expect(normalizeYtUrl('LpNVf8sczqU', 'video')).toBe(
      'https://www.youtube.com/watch?v=LpNVf8sczqU'
    );
  });

  it('turns a bare channel name into an @ handle URL', () => {
    expect(normalizeYtUrl('MrMoMMusic', 'channel')).toBe('https://www.youtube.com/@MrMoMMusic');
  });

  it('keeps the @ when already present', () => {
    expect(normalizeYtUrl('@MrMoMMusic', 'channel')).toBe('https://www.youtube.com/@MrMoMMusic');
  });

  it('passes full URLs through unchanged', () => {
    expect(normalizeYtUrl('https://youtu.be/LpNVf8sczqU', 'video')).toBe(
      'https://youtu.be/LpNVf8sczqU'
    );
    expect(normalizeYtUrl('https://www.youtube.com/playlist?list=PL123', 'playlist')).toBe(
      'https://www.youtube.com/playlist?list=PL123'
    );
  });
});

describe('mapResolvedEntry', () => {
  it('maps fields and formats duration', () => {
    const item = mapResolvedEntry({
      id: 'abc',
      title: 'Song',
      duration: 125,
      channel: 'Artist',
      channel_id: 'UC1',
      thumbnails: [{ url: 'https://img/x', width: 480 }]
    });
    expect(item).toEqual({
      id: 'abc',
      title: 'Song',
      duration: '2:05',
      thumbnail: 'https://img/x',
      channelTitle: 'Artist',
      channelId: 'UC1',
      isPlayable: true
    });
  });

  it('falls back to i.ytimg.com thumbnail and default playability', () => {
    const item = mapResolvedEntry({ id: 'abc', title: 'No thumb' });
    expect(item.thumbnail).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
    expect(item.isPlayable).toBe(true);
    expect(item.channelTitle).toBe('');
  });

  it('preserves explicit non-playable state', () => {
    expect(mapResolvedEntry({ id: 'x', title: 'X', is_playable: false }).isPlayable).toBe(false);
  });
});

describe('mapResolvedContainer', () => {
  const container = {
    id: 'PL1',
    title: 'Playlist',
    channel: 'Artist',
    channel_id: 'UC1',
    entries: [
      { id: 'a', title: 'A', channel: 'Row', channel_id: 'UC2' },
      { id: 'b', title: 'B' },
      { title: 'no id' }
    ]
  };

  it('maps entries and drops rows without id/title', () => {
    const items = mapResolvedContainer(container);
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe('a');
    expect(items[0]?.channelTitle).toBe('Row');
    expect(items[1]?.channelId).toBe('UC1');
    expect(items[1]?.channelTitle).toBe('Artist');
  });

  it('returns an empty array for an empty container', () => {
    expect(mapResolvedContainer({})).toEqual([]);
  });
});

describe('mapVideoEntry', () => {
  it('maps a full yt-dlp entry to the search/channel video shape', () => {
    expect(
      mapVideoEntry({
        id: 'abc',
        title: 'Song',
        description: 'desc',
        duration: 90,
        view_count: 1234,
        channel: 'Artist',
        channel_id: 'UC1',
        upload_date: '20240101',
        thumbnails: [{ url: 'https://img/x', width: 480 }]
      })
    ).toEqual({
      id: 'abc',
      title: 'Song',
      description: 'desc',
      thumbnail: 'https://img/x',
      channelTitle: 'Artist',
      channelId: 'UC1',
      duration: '1:30',
      viewCount: '1234',
      publishedAt: '2024-01-01'
    });
  });

  it('returns empty strings for missing fields', () => {
    const item = mapVideoEntry({});
    expect(item.id).toBe('');
    expect(item.title).toBe('');
    expect(item.thumbnail).toBe('');
    expect(item.viewCount).toBeUndefined();
    expect(item.publishedAt).toBe('');
  });
});

describe('pickChannelThumbnail', () => {
  it('picks the largest channel avatar', () => {
    expect(
      pickChannelThumbnail({
        thumbnails: [
          { url: 'https://img/small', width: 100 },
          { url: 'https://img/big', width: 800 },
          { url: 'https://img/medium', width: 400 }
        ]
      })
    ).toBe('https://img/big');
  });

  it('returns empty string when there are no safe thumbnails', () => {
    expect(pickChannelThumbnail({})).toBe('');
    expect(pickChannelThumbnail({ thumbnails: [{ width: 100 }] })).toBe('');
    expect(pickChannelThumbnail({ thumbnails: [{ url: 'http://img/x' }] })).toBe('');
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
