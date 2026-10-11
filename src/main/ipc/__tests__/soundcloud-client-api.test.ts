import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Siatka regresyjna dla wewnętrznego klienta API SoundCloud (api-v2): wyszukiwarka,
// resolve (track/playlist/user), strony playlisty/profilu oraz rozwiązywanie
// bezpośredniego URL do pobrania. `fetch` jest w pełni mockowany — testy są offline.
// Gdy API zmieni kształt, te testy padają, sygnalizując regresję mapowania.

interface FakeResponse {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  text: () => Promise<string>;
}

function makeRes(body: string, status = 200): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => body
  };
}

const HOME =
  '<html><body><script src="https://a-v2.sndcdn.com/assets/app-123.js"></script></body></html>';
const BUNDLE = 'window.x=1;client_id:"abcdefghij1234567890AB";other:2;';

const TRACK = {
  kind: 'track',
  id: 123,
  title: 'My Song',
  description: 'a song',
  duration: 205000,
  permalink_url: 'https://soundcloud.com/artist/my-song',
  artwork_url: 'https://i1.sndcdn.com/artworks-abc-large.jpg',
  playback_count: 4321,
  created_at: '2026-01-02T10:00:00Z',
  user: { id: 7, username: 'Artist', permalink: 'artist' },
  media: {
    transcodings: [
      {
        url: 'https://api-v2.soundcloud.com/media/xyz/stream/progressive?abc',
        format: { protocol: 'progressive', mime_type: 'audio/mpeg' }
      }
    ]
  }
};

const PLAYLIST = {
  kind: 'playlist',
  id: 555,
  title: 'Best Of',
  permalink_url: 'https://soundcloud.com/artist/sets/best-of',
  user: { id: 7, username: 'Artist', permalink: 'artist' },
  track_count: 3,
  tracks: [TRACK, { ...TRACK, id: 124, title: 'Two' }, { ...TRACK, id: 125, title: 'Three' }]
};

const USER = {
  kind: 'user',
  id: 7,
  username: 'Artist',
  permalink: 'artist',
  avatar_url: 'https://i1.sndcdn.com/avatars-abc-large.jpg',
  followers_count: 99,
  track_count: 2,
  description: 'bio'
};

let resolveJson: unknown = TRACK;

const fetchMock = vi.fn(async (raw: unknown): Promise<FakeResponse> => {
  const url = String(raw);
  if (url === 'https://soundcloud.com/') return makeRes(HOME);
  if (url.includes('a-v2.sndcdn.com/assets/')) return makeRes(BUNDLE);
  if (url.includes('/search/tracks')) return makeRes(JSON.stringify({ collection: [TRACK] }));
  if (url.includes('/resolve')) return makeRes(JSON.stringify(resolveJson));
  if (url.includes('/playlists/')) return makeRes(JSON.stringify(PLAYLIST));
  if (url.includes('/users/') && url.includes('/tracks'))
    return makeRes(JSON.stringify({ collection: [TRACK] }));
  if (url.includes('/media/xyz/stream/progressive'))
    return makeRes(JSON.stringify({ url: 'https://cf-media.sndcdn.com/real.mp3?x=1' }));
  if (/\/tracks\/123(\?|$)/.test(url)) return makeRes(JSON.stringify(TRACK));
  return makeRes('{}', 404);
});

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  resolveJson = TRACK;
  fetchMock.mockClear();
  const { resetClientIdCache } = await import('../soundcloud/soundcloud-client');
  resetClientIdCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scSearchTracks', () => {
  it('extracts client_id from the bundle and maps search results', async () => {
    const { scSearchTracks } = await import('../soundcloud/soundcloud-client');
    const items = await scSearchTracks('lofi', 100, 0);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: '123',
      title: 'My Song',
      channelTitle: 'Artist',
      channelId: 'artist',
      duration: '3:25',
      url: 'https://soundcloud.com/artist/my-song'
    });
    // Artwork upgrade -large -> -t500x500.
    expect(items[0].thumbnail).toBe('https://i1.sndcdn.com/artworks-abc-t500x500.jpg');
  });

  it('caches the extracted client_id across calls', async () => {
    const { scSearchTracks, getClientId } = await import('../soundcloud/soundcloud-client');
    await getClientId();
    const homeCalls = () =>
      fetchMock.mock.calls.filter((c) => String(c[0]) === 'https://soundcloud.com/').length;
    expect(homeCalls()).toBe(1);
    await scSearchTracks('a', 10, 0);
    await scSearchTracks('b', 10, 0);
    // Strona główna pobierana raz — kolejne wywołania używają cache.
    expect(homeCalls()).toBe(1);
  });
});

describe('scResolve', () => {
  it('resolves a track', async () => {
    const { scResolve } = await import('../soundcloud/soundcloud-client');
    const res = await scResolve('https://soundcloud.com/artist/my-song');
    expect(res.kind).toBe('track');
  });

  it('resolves a playlist', async () => {
    resolveJson = PLAYLIST;
    const { scResolve } = await import('../soundcloud/soundcloud-client');
    const res = await scResolve('https://soundcloud.com/artist/sets/best-of');
    expect(res.kind).toBe('playlist');
  });

  it('resolves a user profile', async () => {
    resolveJson = USER;
    const { scResolve } = await import('../soundcloud/soundcloud-client');
    const res = await scResolve('https://soundcloud.com/artist');
    expect(res.kind).toBe('user');
  });
});

describe('scPlaylistTracks', () => {
  it('windows tracks from the full playlist object', async () => {
    const { scPlaylistTracks } = await import('../soundcloud/soundcloud-client');
    const page = await scPlaylistTracks(555, 2, 1);
    expect(page.items.map((i) => i.id)).toEqual(['124', '125']);
  });
});

describe('scProfileSnapshot', () => {
  it('returns channel metadata plus newest tracks', async () => {
    resolveJson = USER;
    const { scProfileSnapshot } = await import('../soundcloud/soundcloud-client');
    const snap = await scProfileSnapshot('https://soundcloud.com/artist');
    expect(snap.channel).toMatchObject({ id: 'artist', title: 'Artist', followerCount: 99 });
    expect(snap.items.length).toBeGreaterThan(0);
  });
});

describe('resolveScDownloadSource / scTrackStreamUrl', () => {
  it('exchanges a progressive transcoding for a fresh direct URL', async () => {
    const { resolveScDownloadSource } = await import('../soundcloud/soundcloud-client');
    const url = await resolveScDownloadSource('https://soundcloud.com/artist/my-song');
    expect(url).toBe('https://cf-media.sndcdn.com/real.mp3?x=1');
  });

  it('accepts a bare numeric track id', async () => {
    const { scTrackStreamUrl } = await import('../soundcloud/soundcloud-client');
    const stream = await scTrackStreamUrl('123');
    expect(stream?.url).toBe('https://cf-media.sndcdn.com/real.mp3?x=1');
  });
});
