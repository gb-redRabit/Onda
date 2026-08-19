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
  extractYtVideoId,
  parseBatchInput,
  mapResolvedEntry,
  mapResolvedContainer,
  mapVideoEntry,
  pickChannelThumbnail,
  extractAvatarUrl,
  parseNetscapeCookies,
  buildStreamGetArgs,
  parseStreamGetOutput
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

  it('inserts auth/runtime flags before the -- separator', () => {
    const withSep = ['-o', 'x.%(ext)s', '--', 'https://example.com/watch?v=1'];
    expect(
      buildYtArgs(withSep, { method: 'manual', cookiesPath: '/tmp/c.txt' }, '/usr/bin/node')
    ).toEqual([
      '-o',
      'x.%(ext)s',
      '--cookies',
      '/tmp/c.txt',
      '--js-runtimes',
      'node:/usr/bin/node',
      '--',
      'https://example.com/watch?v=1'
    ]);
  });

  it('leaves a -- separator unchanged when no extras are added', () => {
    const withSep = ['-J', '--', 'https://example.com/watch?v=1'];
    expect(buildYtArgs(withSep, { method: 'none' }, null)).toEqual(withSep);
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

describe('extractYtVideoId', () => {
  it('extracts the ID from watch / youtu.be / shorts URLs and bare IDs', () => {
    expect(extractYtVideoId('LpNVf8sczqU')).toBe('LpNVf8sczqU');
    expect(extractYtVideoId('https://www.youtube.com/watch?v=LpNVf8sczqU')).toBe('LpNVf8sczqU');
    expect(extractYtVideoId('https://youtu.be/LpNVf8sczqU')).toBe('LpNVf8sczqU');
    expect(extractYtVideoId('https://www.youtube.com/shorts/LpNVf8sczqU')).toBe('LpNVf8sczqU');
  });

  it('returns null for playlists, channels and unknown input', () => {
    expect(extractYtVideoId('https://www.youtube.com/playlist?list=PL123')).toBeNull();
    expect(extractYtVideoId('https://www.youtube.com/@Channel')).toBeNull();
    expect(extractYtVideoId('not a url')).toBeNull();
  });
});

describe('parseBatchInput', () => {
  it('splits newlines and commas and drops unrecognized lines', () => {
    const entries = parseBatchInput(
      'https://youtu.be/a1111111111\nhttps://www.youtube.com/watch?v=b2222222222\nnot a url\n'
    );
    expect(entries.map((e) => e.videoId)).toEqual(['a1111111111', 'b2222222222']);
  });

  it('dedupes by video ID across different URL forms', () => {
    const entries = parseBatchInput(
      'https://youtu.be/LpNVf8sczqU, https://www.youtube.com/watch?v=LpNVf8sczqU'
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.videoId).toBe('LpNVf8sczqU');
  });

  it('keeps playlists and channels with a null videoId', () => {
    const entries = parseBatchInput(
      'https://www.youtube.com/playlist?list=PL123\nhttps://www.youtube.com/@Channel'
    );
    expect(entries.map((e) => e.kind)).toEqual(['playlist', 'channel']);
    expect(entries.every((e) => e.videoId === null)).toBe(true);
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

  it('prefers the square avatar over wider banner images', () => {
    expect(
      pickChannelThumbnail({
        thumbnails: [
          { url: 'https://img/banner', width: 2560, height: 424 },
          { url: 'https://img/avatar', width: 900, height: 900 },
          { url: 'https://img/banner2', width: 2000, height: 333 }
        ]
      })
    ).toBe('https://img/avatar');
  });

  it('falls back to the single thumbnail string when no list exists', () => {
    expect(pickChannelThumbnail({ thumbnail: 'https://img/single' })).toBe('https://img/single');
  });

  it('returns empty string when there are no safe thumbnails', () => {
    expect(pickChannelThumbnail({})).toBe('');
    expect(pickChannelThumbnail({ thumbnails: [{ width: 100 }] })).toBe('');
    expect(pickChannelThumbnail({ thumbnails: [{ url: 'http://img/x' }] })).toBe('');
  });
});

describe('extractAvatarUrl', () => {
  it('extracts a yt3.ggpht.com avatar from channel page HTML', () => {
    const html =
      '"avatar":{"thumbnails":[{"url":"https://yt3.ggpht.com/ytc/AIdro_lf9abc=s48-c-k-c0x00ffffff-no-rj","width":48,"height":48}]}';
    expect(extractAvatarUrl(html)).toBe(
      'https://yt3.ggpht.com/ytc/AIdro_lf9abc=s48-c-k-c0x00ffffff-no-rj'
    );
  });

  it('extracts a yt3.googleusercontent.com avatar', () => {
    const html = 'var ytInitialData = {"avatar":{"url":"https://yt3.googleusercontent.com/abc=s800-c-k"}}';
    expect(extractAvatarUrl(html)).toBe('https://yt3.googleusercontent.com/abc=s800-c-k');
  });

  it('returns empty string when no avatar URL is present', () => {
    expect(extractAvatarUrl('<html><body>no avatar here</body></html>')).toBe('');
    expect(extractAvatarUrl('')).toBe('');
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

describe('parseNetscapeCookies', () => {
  it('round-trips a serialized domain cookie', () => {
    const cookie = {
      name: 'SID',
      value: 'abc',
      domain: '.youtube.com',
      hostOnly: false,
      path: '/',
      secure: true,
      expirationDate: 1710000000
    };
    const parsed = parseNetscapeCookies(serializeCookies([cookie]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      name: 'SID',
      value: 'abc',
      url: 'https://youtube.com/',
      domain: 'youtube.com',
      path: '/',
      secure: true,
      expirationDate: 1710000000
    });
  });

  it('keeps host-only cookies without a domain option', () => {
    const parsed = parseNetscapeCookies(
      'accounts.google.com\tFALSE\t/\tTRUE\t1710000000\tSID\tabc\n'
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].domain).toBeUndefined();
    expect(parsed[0].url).toBe('https://accounts.google.com/');
  });

  it('builds an http url for insecure cookies', () => {
    const parsed = parseNetscapeCookies('youtube.com\tFALSE\t/\tFALSE\t0\tVISITOR\tabc\n');
    expect(parsed[0].url).toBe('http://youtube.com/');
    expect(parsed[0].secure).toBe(false);
    expect(parsed[0].expirationDate).toBeUndefined();
  });

  it('uses the cookie path in the url', () => {
    const parsed = parseNetscapeCookies('.youtube.com\tTRUE\t/foo\tTRUE\t0\tSID\tabc\n');
    expect(parsed[0].url).toBe('https://youtube.com/foo');
    expect(parsed[0].path).toBe('/foo');
  });

  it('skips comments and malformed lines', () => {
    const parsed = parseNetscapeCookies(
      '# Netscape HTTP Cookie File\nbroken line\n.youtube.com\tTRUE\t/\tTRUE\t1710000000\tSID\tabc\n'
    );
    expect(parsed).toHaveLength(1);
  });

  it('round-trips a full serialized export losslessly', () => {
    const cookies = [
      { name: 'SID', value: 'a', domain: '.youtube.com', hostOnly: false, path: '/', secure: true },
      {
        name: 'LOGIN_INFO',
        value: 'b',
        domain: 'accounts.google.com',
        hostOnly: true,
        path: '/',
        secure: true,
        expirationDate: 1720000000
      },
      {
        name: 'VISITOR',
        value: 'c',
        domain: 'youtube.com',
        hostOnly: true,
        path: '/',
        secure: false
      }
    ];
    const parsed = parseNetscapeCookies(serializeCookies(cookies));
    expect(parsed.map((c) => c.name)).toEqual(['SID', 'LOGIN_INFO', 'VISITOR']);
    expect(parsed[0].domain).toBe('youtube.com');
    expect(parsed[1].domain).toBeUndefined();
    expect(parsed[2].expirationDate).toBeUndefined();
  });
});

describe('buildStreamGetArgs', () => {
  it('builds a minimal -g invocation preferring progressive audio (ios_safari/tv_embedded)', () => {
    expect(buildStreamGetArgs('https://youtube.com/watch?v=abc')).toEqual([
      'https://youtube.com/watch?v=abc',
      '--no-playlist',
      '-f',
      'ba[protocol^=https]/bestaudio[protocol^=https]/b[protocol^=https]/w[protocol^=https]/ba/bestaudio/b/w',
      '-g',
      '-4',
      '--extractor-args',
      'youtube:player_client=ios_safari,tv_embedded',
      '--no-warnings',
      '--no-check-formats'
    ]);
  });

  it('falls back to the android,web client pair when requested', () => {
    const args = buildStreamGetArgs('https://youtube.com/watch?v=abc', [], { fallback: true });
    expect(args).toContain('youtube:player_client=android,web');
  });

  it('appends proxy args at the end', () => {
    const args = buildStreamGetArgs('https://youtu.be/abc', ['--proxy', 'socks5://127.0.0.1:1080']);
    expect(args.slice(-2)).toEqual(['--proxy', 'socks5://127.0.0.1:1080']);
  });
});

describe('parseStreamGetOutput', () => {
  it('accepts a single-line https stream url', () => {
    const out = parseStreamGetOutput('https://rr1.googlevideo.com/videoplayback?ip=1.2.3.4\n');
    expect(out).toEqual({ ok: true, url: 'https://rr1.googlevideo.com/videoplayback?ip=1.2.3.4' });
  });

  it('takes the first line when yt-dlp prints multiple lines', () => {
    const out = parseStreamGetOutput('https://a.example/1.mp3\nhttps://a.example/2.mp3\n');
    expect(out.ok).toBe(true);
    expect(out.url).toBe('https://a.example/1.mp3');
  });

  it('rejects empty output', () => {
    expect(parseStreamGetOutput('')).toEqual({ ok: false, code: 'invalid' });
    expect(parseStreamGetOutput('   \n')).toEqual({ ok: false, code: 'invalid' });
  });

  it('rejects non-http output', () => {
    expect(parseStreamGetOutput('file:///etc/passwd')).toEqual({ ok: false, code: 'invalid' });
    expect(parseStreamGetOutput('ERROR: something failed')).toEqual({ ok: false, code: 'invalid' });
  });

  it('flags hls playlists as unsupported', () => {
    expect(parseStreamGetOutput('https://manifest.googlevideo.com/api/manifest/hls_variant/master.m3u8')).toEqual({
      ok: false,
      code: 'hls'
    });
  });
});
