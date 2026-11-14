import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractClientIdFromBundle,
  extractSignedUrlExpiryMs,
  getClientId,
  mapScTrack,
  resetClientIdCache,
  resolveScDownloadSource,
  scPlaylistTracks,
  scProfileSnapshot,
  scResolve,
  scSearchTracks,
  scTrackStreamUrl,
  scUserTracks,
  sanitizeFileName,
  upgradeArtworkUrl
} from '../soundcloud/soundcloud-client';

const SC_TRACK = {
  kind: 'track',
  id: 12345678,
  title: 'My Song',
  description: 'A song',
  duration: 205000,
  permalink_url: 'https://soundcloud.com/artist/my-song',
  artwork_url: 'https://i1.sndcdn.com/artworks-abc-large.jpg',
  playback_count: 4321,
  created_at: '2026-01-02T10:00:00Z',
  user: {
    id: 7,
    username: 'Artist',
    permalink: 'artist',
    avatar_url: 'https://i1.sndcdn.com/avatars-def-large.jpg'
  },
  media: {
    transcodings: [
      {
        url: 'https://api-v2.soundcloud.com/media/transcode/x',
        format: { protocol: 'progressive', mime_type: 'audio/mpeg' }
      },
      {
        url: 'https://api-v2.soundcloud.com/media/transcode/y',
        format: { protocol: 'hls', mime_type: 'audio/mpeg' }
      }
    ]
  }
};

describe('extractClientIdFromBundle', () => {
  it('matches the embedded client_id', () => {
    expect(extractClientIdFromBundle('x={a:1},client_id:"abcdef1234567890ab"')).toBe(
      'abcdef1234567890ab'
    );
    expect(extractClientIdFromBundle("client_id = 'short'")).toBeNull();
    expect(extractClientIdFromBundle('nothing here')).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('strips filesystem-hostile characters and trims dots/spaces', () => {
    expect(sanitizeFileName('My/Song: "Live"? *Remix*')).toBe('My_Song_ _Live__ _Remix_');
    expect(sanitizeFileName('  trailing...  ')).toBe('trailing');
    expect(sanitizeFileName('a\\b|c<d>e')).toBe('a_b_c_d_e');
    expect(sanitizeFileName('')).toBe('track');
  });
});

describe('extractSignedUrlExpiryMs', () => {
  // Prawdziwy blok CloudFront Policy przechwycony z URL cf-media.sndcdn.com.
  const POLICY =
    'eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiKjovL2NmLW1lZGlhLnNuZGNkbi5jb20vaTFsOVhvSVF4ZUE3LjEyOC5tcDMqIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzg3MzUwNjA2fX19XX0_';

  it('reads AWS:EpochTime out of the signed Policy param', () => {
    const url = `https://cf-media.sndcdn.com/x.128.mp3?Policy=${POLICY}&Signature=abc&Key-Pair-Id=k`;
    expect(extractSignedUrlExpiryMs(url)).toBe(1787350606000);
  });

  it('returns null for unsigned or malformed URLs', () => {
    expect(extractSignedUrlExpiryMs('https://cf-media.sndcdn.com/x.mp3')).toBeNull();
    expect(
      extractSignedUrlExpiryMs('https://cf-media.sndcdn.com/x.mp3?Policy=!!!notbase64')
    ).toBeNull();
  });
});

describe('upgradeArtworkUrl', () => {
  it('requests the big square variant', () => {
    expect(upgradeArtworkUrl('https://i1.sndcdn.com/artworks-abc-large.jpg')).toBe(
      'https://i1.sndcdn.com/artworks-abc-t500x500.jpg'
    );
  });

  it('rejects unsafe URLs and passes through non-large tokens', () => {
    expect(upgradeArtworkUrl('http://i1.sndcdn.com/a-large.jpg')).toBe('');
    expect(upgradeArtworkUrl('https://127.0.0.2/a-large.jpg')).toBe('');
    expect(upgradeArtworkUrl(null)).toBe('');
    expect(upgradeArtworkUrl('https://i1.sndcdn.com/a-t500x500.jpg')).toBe(
      'https://i1.sndcdn.com/a-t500x500.jpg'
    );
  });
});

describe('mapScTrack', () => {
  it('maps an API track onto the shared video shape', () => {
    const video = mapScTrack(SC_TRACK);
    expect(video).toMatchObject({
      id: '12345678',
      title: 'My Song',
      thumbnail: 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg',
      channelTitle: 'Artist',
      channelId: 'artist',
      duration: '3:25',
      viewCount: '4321',
      publishedAt: '2026-01-02',
      url: 'https://soundcloud.com/artist/my-song'
    });
  });

  it('does NOT fall back to the user avatar when artwork is missing', () => {
    const video = mapScTrack({ ...SC_TRACK, artwork_url: null });
    expect(video.thumbnail).toBe('');
    expect(video.channelTitle).toBe('Artist');
  });
});

type FetchHandler = (url: string) => {
  status: number;
  body?: string;
  contentType?: string;
};

function mockFetch(handler: FetchHandler): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    const res = handler(url);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      headers: { get: () => (res.body ? String(res.body.length) : '0') },
      text: async () => res.body ?? ''
    };
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  resetClientIdCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scSearchTracks with client_id rotation', () => {
  it('re-extracts client_id on 401 and retries once', async () => {
    let apiCalls = 0;
    const fetchMock = mockFetch((url) => {
      if (url.startsWith('https://api-v2.soundcloud.com/search')) {
        apiCalls++;
        if (apiCalls === 1) return { status: 401 };
        if (!url.includes('client_id=fresh1234567890ab')) return { status: 401 };
        return {
          status: 200,
          body: JSON.stringify({ collection: [SC_TRACK] })
        };
      }
      if (url === 'https://soundcloud.com/') {
        return {
          status: 200,
          body:
            '<html><script src="/assets/49-a.js"></script>' +
            '<script src="https://a-v2.sndcdn.com/assets/50-b.js" crossorigin></script></html>'
        };
      }
      if (url.includes('/assets/')) {
        // Pierwszy bundle nie ma id; drugi niesie świeże.
        return {
          status: 200,
          body: url.includes('49-a') ? 'window.__sc = {}' : 'config={client_id:"fresh1234567890ab"}'
        };
      }
      return { status: 404 };
    });

    const items = await scSearchTracks('test query');
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe('https://soundcloud.com/artist/my-song');
    expect(await getClientId()).toBe('fresh1234567890ab');
    expect(apiCalls).toBe(2);
    // Musiał zostać sprawdzony absolutny URL bundle'a a-v2.sndcdn.com.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('a-v2.sndcdn.com'))).toBe(true);
  });
});

describe('client_id extraction failure throttling', () => {
  it('does not re-probe immediately after a failed extraction', async () => {
    const fetchMock = mockFetch((url) => {
      if (url === 'https://soundcloud.com/') {
        return { status: 200, body: '<html><p>no scripts here</p></html>' };
      }
      return { status: 404 };
    });

    resetClientIdCache();
    await expect(getClientId()).resolves.toBeNull();
    const callsAfterFirst = fetchMock.mock.calls.length;
    await expect(getClientId()).resolves.toBeNull();
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });
});

const HOME_HTML = '<html><script src="/assets/app.js"></script></html>';
const BUNDLE_JS = 'config={client_id:"abcdef1234567890ab"}';
const CLIENT_ID = 'abcdef1234567890ab';

type ApiResponse = { status: number; body?: string };

function scFetch(api: (url: string) => ApiResponse | undefined): ReturnType<typeof vi.fn> {
  return mockFetch((url) => {
    if (url === 'https://soundcloud.com/') return { status: 200, body: HOME_HTML };
    if (url.includes('/assets/')) return { status: 200, body: BUNDLE_JS };
    return api(url) ?? { status: 404 };
  });
}

function makeTracks(count: number, start = 1): unknown[] {
  return Array.from({ length: count }, (_, index) => ({
    ...SC_TRACK,
    id: start + index,
    title: `Track ${start + index}`
  }));
}

describe('client_id cache edges', () => {
  it('returns null when the home page fails or the body is too large', async () => {
    mockFetch(() => ({ status: 500 }));
    await expect(getClientId()).resolves.toBeNull();

    resetClientIdCache();
    mockFetch(() => ({ status: 200, body: 'x'.repeat(5 * 1024 * 1024 + 1) }));
    await expect(getClientId()).resolves.toBeNull();

    resetClientIdCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => '0' },
        text: async () => 'x'.repeat(5 * 1024 * 1024 + 1)
      }))
    );
    await expect(getClientId()).resolves.toBeNull();
  });

  it('shares an in-flight extraction and caches the result', async () => {
    const fetchMock = scFetch(() => undefined);

    const [first, second] = await Promise.all([getClientId(), getClientId()]);
    expect(first).toBe(CLIENT_ID);
    expect(second).toBe(CLIENT_ID);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === 'https://soundcloud.com/')
    ).toHaveLength(1);

    const calls = fetchMock.mock.calls.length;
    await expect(getClientId()).resolves.toBe(CLIENT_ID);
    expect(fetchMock.mock.calls.length).toBe(calls);

    await expect(getClientId(true)).resolves.toBe(CLIENT_ID);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it('resolves protocol-relative bundle urls', async () => {
    mockFetch((url) => {
      if (url === 'https://soundcloud.com/') {
        return {
          status: 200,
          body: '<script src="//a-v2.sndcdn.com/assets/x.js"></script>'
        };
      }
      if (url === 'https://a-v2.sndcdn.com/assets/x.js') {
        return { status: 200, body: BUNDLE_JS };
      }
      return { status: 404 };
    });

    await expect(getClientId()).resolves.toBe(CLIENT_ID);
  });

  it('returns null when bundles contain no client id', async () => {
    mockFetch((url) => {
      if (url === 'https://soundcloud.com/') {
        return { status: 200, body: '<script src="/assets/x.js"></script>' };
      }
      if (url.includes('/assets/')) return { status: 200, body: 'var x = 1' };
      return { status: 404 };
    });

    await expect(getClientId()).resolves.toBeNull();
  });

  it('treats a missing content-length as zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === 'https://soundcloud.com/') {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () => HOME_HTML
          };
        }
        if (url.includes('/assets/')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () => BUNDLE_JS
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify({ collection: [] })
        };
      })
    );

    await expect(scSearchTracks('x')).resolves.toEqual([]);
  });
});

describe('scApi errors', () => {
  it('fails without a client id', async () => {
    mockFetch(() => ({ status: 500 }));

    await expect(scSearchTracks('x')).rejects.toThrow('client_id unavailable');
  });

  it('propagates non-auth HTTP errors and invalid JSON', async () => {
    scFetch((url) => (url.includes('/search') ? { status: 500 } : undefined));
    await expect(scSearchTracks('x')).rejects.toThrow('HTTP 500');

    resetClientIdCache();
    scFetch((url) => (url.includes('/search') ? { status: 200, body: 'not json' } : undefined));
    await expect(scSearchTracks('x')).rejects.toThrow('Invalid JSON');
  });

  it('propagates network errors that are not ScApiError', async () => {
    mockFetch((url) => {
      if (url === 'https://soundcloud.com/') return { status: 200, body: HOME_HTML };
      if (url.includes('/assets/')) return { status: 200, body: BUNDLE_JS };
      throw new Error('network down');
    });

    await expect(scSearchTracks('x')).rejects.toThrow('network down');
  });

  it('skips null params and tolerates a missing collection', async () => {
    scFetch((url) => (url.includes('/search') ? { status: 200, body: '{}' } : undefined));

    await expect(scSearchTracks('x', 10, null as never)).resolves.toEqual([]);
  });
});

describe('scResolve', () => {
  it('resolves tracks, playlists and users', async () => {
    const cases: Array<[unknown, string]> = [
      [{ ...SC_TRACK }, 'track'],
      [{ kind: 'playlist', id: 1, title: 'P', tracks: [SC_TRACK] }, 'playlist'],
      [{ kind: 'user', id: 7, username: 'U', followers_count: 1 }, 'user']
    ];

    for (const [resource, kind] of cases) {
      resetClientIdCache();
      scFetch((url) =>
        url.includes('/resolve') ? { status: 200, body: JSON.stringify(resource) } : undefined
      );
      expect((await scResolve('https://soundcloud.com/x')).kind).toBe(kind);
    }
  });

  it('rejects empty and unsupported resources', async () => {
    scFetch((url) => (url.includes('/resolve') ? { status: 200, body: 'null' } : undefined));
    await expect(scResolve('u')).rejects.toThrow('Empty resolve result');

    resetClientIdCache();
    scFetch((url) =>
      url.includes('/resolve') ? { status: 200, body: '{"kind":"comment"}' } : undefined
    );
    await expect(scResolve('u')).rejects.toThrow('Unsupported');
  });
});

describe('scUserTracks', () => {
  it('maps valid tracks and drops incomplete rows', async () => {
    scFetch((url) =>
      url.includes('/users/7/tracks')
        ? {
            status: 200,
            body: JSON.stringify({
              collection: [SC_TRACK, { id: null, title: 'x' }, { id: 2, title: '' }]
            })
          }
        : undefined
    );

    const result = await scUserTracks(7, 10, 0);

    expect(result.items).toHaveLength(1);
    expect(result.total).toBeNull();
  });

  it('returns an empty list when the response has no collection', async () => {
    scFetch((url) => (url.includes('/users/7/tracks') ? { status: 200, body: '{}' } : undefined));

    await expect(scUserTracks(7, 10, 0)).resolves.toEqual({ items: [], total: null });
  });
});

describe('scProfileSnapshot', () => {
  it('rejects non-user resources and users without an id', async () => {
    scFetch((url) =>
      url.includes('/resolve') ? { status: 200, body: JSON.stringify({ ...SC_TRACK }) } : undefined
    );
    await expect(scProfileSnapshot('https://soundcloud.com/track')).rejects.toThrow(
      'Not a SoundCloud profile'
    );

    resetClientIdCache();
    scFetch((url) =>
      url.includes('/resolve')
        ? { status: 200, body: JSON.stringify({ kind: 'user', username: 'x', followers_count: 1 }) }
        : undefined
    );
    await expect(scProfileSnapshot('https://soundcloud.com/user')).rejects.toThrow(
      'Profile without id'
    );
  });

  it('falls back for missing permalink, description and track count', async () => {
    scFetch((url) => {
      if (url.includes('/resolve')) {
        return {
          status: 200,
          body: JSON.stringify({
            kind: 'user',
            id: 9,
            username: '',
            followers_count: 2,
            avatar_url: null,
            description: null
          })
        };
      }
      if (url.includes('/users/9/tracks')) {
        return { status: 200, body: JSON.stringify({ collection: [] }) };
      }
      return undefined;
    });

    const snapshot = await scProfileSnapshot('https://soundcloud.com/unknown');

    expect(snapshot.channel).toMatchObject({
      id: '9',
      url: 'https://soundcloud.com/unknown',
      title: '',
      thumbnail: '',
      followerCount: 2,
      trackCount: 0,
      description: ''
    });
    expect(snapshot.items).toEqual([]);
  });

  it('paginates to the requested cap', async () => {
    scFetch((url) => {
      if (url.includes('/resolve')) {
        return {
          status: 200,
          body: JSON.stringify({
            kind: 'user',
            id: 7,
            permalink: 'artist',
            username: 'Artist',
            avatar_url: 'https://i1.sndcdn.com/avatars-def-large.jpg',
            followers_count: 10,
            track_count: 250,
            description: 'desc'
          })
        };
      }
      if (url.includes('/users/7/tracks') && url.includes('offset=0')) {
        return { status: 200, body: JSON.stringify({ collection: makeTracks(200) }) };
      }
      if (url.includes('/users/7/tracks') && url.includes('offset=200')) {
        return { status: 200, body: JSON.stringify({ collection: makeTracks(50, 201) }) };
      }
      return undefined;
    });

    const snapshot = await scProfileSnapshot('https://soundcloud.com/profile', 250);

    expect(snapshot.items).toHaveLength(250);
    expect(snapshot.channel).toMatchObject({
      id: 'artist',
      url: 'https://soundcloud.com/artist',
      title: 'Artist',
      thumbnail: 'https://i1.sndcdn.com/avatars-def-t500x500.jpg',
      followerCount: 10,
      trackCount: 250,
      description: 'desc'
    });
  });
});

describe('scPlaylistTracks', () => {
  it('slices playable tracks from the full playlist object', async () => {
    scFetch((url) =>
      url.includes('/playlists/5')
        ? {
            status: 200,
            body: JSON.stringify({
              kind: 'playlist',
              id: 5,
              tracks: [SC_TRACK, { id: null, title: 'x' }, { ...SC_TRACK, id: 2, title: 'B' }]
            })
          }
        : undefined
    );

    const first = await scPlaylistTracks(5, 1, 0);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.id).toBe('12345678');

    const second = await scPlaylistTracks(5, 10, 1);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).toBe('2');
  });

  it('returns no items when the playlist has no tracks', async () => {
    scFetch((url) =>
      url.includes('/playlists/6')
        ? { status: 200, body: JSON.stringify({ kind: 'playlist', id: 6 }) }
        : undefined
    );

    await expect(scPlaylistTracks(6, 10, 0)).resolves.toEqual({ items: [] });
  });
});

describe('scTrackStreamUrl', () => {
  const EXCHANGE = { status: 200, body: JSON.stringify({ url: 'https://cdn.example/a.mp3' }) };

  function streamFetch(api: (url: string) => ApiResponse | undefined): ReturnType<typeof vi.fn> {
    return scFetch(api);
  }

  it('fetches a numeric track id and exchanges the progressive transcoding', async () => {
    streamFetch((url) => {
      if (url.includes('/tracks/123')) return { status: 200, body: JSON.stringify(SC_TRACK) };
      if (url.includes('/media/transcode/x')) return EXCHANGE;
      return undefined;
    });

    await expect(scTrackStreamUrl('123')).resolves.toEqual({ url: 'https://cdn.example/a.mp3' });
  });

  it('returns null when the fetched track has no id', async () => {
    streamFetch((url) =>
      url.includes('/tracks/9') ? { status: 200, body: JSON.stringify({ title: 'x' }) } : undefined
    );

    await expect(scTrackStreamUrl('9')).resolves.toBeNull();
  });

  it('returns null when a permalink resolves to a non-track', async () => {
    streamFetch((url) =>
      url.includes('/resolve')
        ? { status: 200, body: JSON.stringify({ kind: 'playlist', id: 1, tracks: [] }) }
        : undefined
    );

    await expect(scTrackStreamUrl('https://soundcloud.com/set')).resolves.toBeNull();
  });

  it('resolves a permalink to a track and handles missing media', async () => {
    streamFetch((url) => {
      if (url.includes('/resolve')) return { status: 200, body: JSON.stringify(SC_TRACK) };
      if (url.includes('/media/transcode/x')) return EXCHANGE;
      return undefined;
    });
    await expect(scTrackStreamUrl('https://soundcloud.com/artist/my-song')).resolves.toEqual({
      url: 'https://cdn.example/a.mp3'
    });

    const noMedia = { ...SC_TRACK, media: undefined };
    await expect(scTrackStreamUrl(noMedia as never)).resolves.toBeNull();
  });

  it('accepts a track object and rejects tracks without progressive audio', async () => {
    streamFetch((url) => (url.includes('/media/transcode/x') ? EXCHANGE : undefined));
    await expect(scTrackStreamUrl(SC_TRACK as never)).resolves.toEqual({
      url: 'https://cdn.example/a.mp3'
    });

    const hlsOnly = {
      ...SC_TRACK,
      media: { transcodings: [{ url: 'https://api/hls', format: { protocol: 'hls' } }] }
    };
    await expect(scTrackStreamUrl(hlsOnly as never)).resolves.toBeNull();

    const noUrl = {
      ...SC_TRACK,
      media: { transcodings: [{ format: { protocol: 'progressive', mime_type: 'audio/mpeg' } }] }
    };
    await expect(scTrackStreamUrl(noUrl as never)).resolves.toBeNull();
  });

  it('returns null without a client id', async () => {
    mockFetch((url) => (url.includes('/media/transcode/x') ? EXCHANGE : { status: 500 }));

    await expect(scTrackStreamUrl(SC_TRACK as never)).resolves.toBeNull();
  });

  it('rejects exchange payloads without a safe https url', async () => {
    streamFetch((url) =>
      url.includes('/media/transcode/x')
        ? { status: 200, body: JSON.stringify({ url: 'http://cdn.example/a.mp3' }) }
        : undefined
    );
    await expect(scTrackStreamUrl(SC_TRACK as never)).resolves.toBeNull();

    resetClientIdCache();
    streamFetch((url) =>
      url.includes('/media/transcode/x') ? { status: 200, body: '{}' } : undefined
    );
    await expect(scTrackStreamUrl(SC_TRACK as never)).resolves.toBeNull();
  });

  it('resolves the fresh download source and rejects missing audio', async () => {
    streamFetch((url) => {
      if (url.includes('/tracks/123')) return { status: 200, body: JSON.stringify(SC_TRACK) };
      if (url.includes('/media/transcode/x')) return EXCHANGE;
      return undefined;
    });
    await expect(resolveScDownloadSource('123')).resolves.toBe('https://cdn.example/a.mp3');

    resetClientIdCache();
    streamFetch((url) =>
      url.includes('/tracks/9') ? { status: 200, body: JSON.stringify(SC_TRACK) } : undefined
    );
    const silent = { ...SC_TRACK, media: { transcodings: [] } };
    streamFetch((url) =>
      url.includes('/tracks/9') ? { status: 200, body: JSON.stringify(silent) } : undefined
    );
    await expect(resolveScDownloadSource('9')).rejects.toThrow('No progressive audio');
  });
});
