import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractClientIdFromBundle,
  extractSignedUrlExpiryMs,
  getClientId,
  mapScTrack,
  resetClientIdCache,
  scSearchTracks,
  sanitizeFileName,
  upgradeArtworkUrl
} from '../soundcloud-client';

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
      { url: 'https://api-v2.soundcloud.com/media/transcode/x', format: { protocol: 'progressive', mime_type: 'audio/mpeg' } },
      { url: 'https://api-v2.soundcloud.com/media/transcode/y', format: { protocol: 'hls', mime_type: 'audio/mpeg' } }
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
  // Real CloudFront Policy blob captured from a cf-media.sndcdn.com URL.
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
        // The first bundle has no id; the second carries the fresh one.
        return {
          status: 200,
          body:
            url.includes('49-a')
              ? 'window.__sc = {}'
              : 'config={client_id:"fresh1234567890ab"}'
        };
      }
      return { status: 404 };
    });

    const items = await scSearchTracks('test query');
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe('https://soundcloud.com/artist/my-song');
    expect(await getClientId()).toBe('fresh1234567890ab');
    expect(apiCalls).toBe(2);
    // The absolute a-v2.sndcdn.com bundle URL must have been probed.
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
