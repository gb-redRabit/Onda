import { describe, it, expect, vi, beforeEach } from 'vitest';

// Siatka regresyjna dla publicznego kontraktu handlerów `sc:*` (wyszukiwarka,
// resolve/resolveMore, kanał, kanał-całość). Klient api-v2 i fallbacki yt-dlp są
// mockowane, więc testy są offline i pilnują gałęzi logiki (sukces/fallback/błąd)
// oraz kształtu odpowiedzi widzianej przez renderer.

const h = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(ch, fn);
      }
    }
  };
});

vi.mock('electron', () => ({ ipcMain: h.ipcMain, app: { getPath: () => '' } }));

vi.mock('../soundcloud/soundcloud-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../soundcloud/soundcloud-client')>();
  return {
    ...actual,
    scSearchTracks: vi.fn(),
    scResolve: vi.fn(),
    scPlaylistTracks: vi.fn(),
    scUserTracks: vi.fn(),
    scProfileSnapshot: vi.fn()
  };
});

vi.mock('../soundcloud/soundcloud-fallback', () => ({
  fallbackSearch: vi.fn(),
  fallbackResolvePage: vi.fn()
}));

vi.mock('../soundcloud/soundcloud-channel-fallback', () => ({
  fallbackChannelPage: vi.fn(),
  fallbackChannelAll: vi.fn()
}));

vi.mock('../soundcloud/soundcloud-stream', () => ({ getScStreamUrl: vi.fn() }));
vi.mock('../youtube/youtube-handlers', () => ({ fetchRangeJson: vi.fn() }));

import * as sc from '../soundcloud/soundcloud-client';
import * as fb from '../soundcloud/soundcloud-fallback';
import { registerSoundcloudHandlers } from '../soundcloud/soundcloud-handlers';

registerSoundcloudHandlers();
const call = (channel: string, ...args: unknown[]): unknown => {
  const fn = h.handlers.get(channel);
  if (!fn) throw new Error(`handler not registered: ${channel}`);
  return fn({}, ...args);
};

const TRACK = {
  id: 123,
  title: 'My Song',
  duration: 205000,
  permalink_url: 'https://soundcloud.com/artist/my-song',
  artwork_url: 'https://i1.sndcdn.com/artworks-abc-large.jpg',
  user: { username: 'Artist', permalink: 'artist' }
};

const VIDEO_ITEM = {
  id: '123',
  title: 'My Song',
  description: '',
  duration: '3:25',
  thumbnail: 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg',
  channelTitle: 'Artist',
  channelId: 'artist',
  publishedAt: '',
  url: 'https://soundcloud.com/artist/my-song'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sc:search', () => {
  it('returns mapped items from the API client', async () => {
    vi.mocked(sc.scSearchTracks).mockResolvedValueOnce([VIDEO_ITEM]);
    const res = (await call('sc:search', 'lofi')) as { success: boolean; items: unknown[] };
    expect(res.success).toBe(true);
    expect(res.items).toHaveLength(1);
  });

  it('rejects an empty query without hitting the API', async () => {
    const res = (await call('sc:search', '   ')) as { success: boolean };
    expect(res.success).toBe(false);
    expect(sc.scSearchTracks).not.toHaveBeenCalled();
  });

  it('falls back to yt-dlp when the API client throws', async () => {
    vi.mocked(sc.scSearchTracks).mockRejectedValueOnce(new Error('rotated'));
    vi.mocked(fb.fallbackSearch).mockResolvedValueOnce([VIDEO_ITEM]);
    const res = (await call('sc:search', 'lofi')) as { success: boolean; items: unknown[] };
    expect(res.success).toBe(true);
    expect(fb.fallbackSearch).toHaveBeenCalledOnce();
    expect(res.items).toHaveLength(1);
  });

  it('returns a failure when both API and fallback fail', async () => {
    vi.mocked(sc.scSearchTracks).mockRejectedValueOnce(new Error('a'));
    vi.mocked(fb.fallbackSearch).mockRejectedValueOnce(new Error('b'));
    const res = (await call('sc:search', 'lofi')) as { success: boolean; items: unknown[] };
    expect(res.success).toBe(false);
    expect(res.items).toEqual([]);
  });
});

describe('sc:resolve', () => {
  it('resolves a track into a single video item', async () => {
    vi.mocked(sc.scResolve).mockResolvedValueOnce({ kind: 'track', track: TRACK });
    const res = (await call('sc:resolve', 'https://soundcloud.com/artist/my-song')) as {
      success: boolean;
      result: { kind: string; items: Array<{ id: string; title: string }> };
    };
    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('video');
    expect(res.result.items[0]).toMatchObject({ id: '123', title: 'My Song' });
  });

  it('resolves a playlist with its first page', async () => {
    vi.mocked(sc.scResolve).mockResolvedValueOnce({
      kind: 'playlist',
      playlist: {
        id: 555,
        title: 'Best Of',
        track_count: 3,
        user: { username: 'Artist', permalink: 'artist' }
      }
    });
    vi.mocked(sc.scPlaylistTracks).mockResolvedValueOnce({ items: [VIDEO_ITEM] });
    const res = (await call('sc:resolve', 'https://soundcloud.com/artist/sets/best-of')) as {
      success: boolean;
      result: { kind: string; items: unknown[]; meta: { totalItems: number } };
    };
    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('playlist');
    expect(res.result.items).toHaveLength(1);
    expect(res.result.meta.totalItems).toBe(3);
  });

  it('opens a profile with a light marker (no API resolve)', async () => {
    const res = (await call('sc:resolve', 'https://soundcloud.com/artist')) as {
      success: boolean;
      result: { kind: string; items: unknown[] };
    };
    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('channel');
    expect(res.result.items).toEqual([]);
    expect(sc.scResolve).not.toHaveBeenCalled();
  });

  it('rejects personalized discover sets with an unsupported code', async () => {
    const res = (await call(
      'sc:resolve',
      'https://soundcloud.com/discover/sets/your-moods:1:1'
    )) as {
      success: boolean;
      code?: string;
    };
    expect(res.success).toBe(false);
    expect(res.code).toBe('unsupported');
  });

  it('falls back to yt-dlp resolve when the API throws', async () => {
    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api down'));
    vi.mocked(fb.fallbackResolvePage).mockResolvedValueOnce({
      title: 'Fallback',
      items: [VIDEO_ITEM],
      resolvedItems: [
        {
          id: '123',
          title: 'My Song',
          thumbnail: 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg',
          channelTitle: 'Artist',
          channelId: 'artist'
        }
      ],
      totalItems: 1,
      hasMore: false
    });
    const res = (await call('sc:resolve', 'https://soundcloud.com/artist/my-song')) as {
      success: boolean;
      result: { kind: string; title: string };
    };
    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('video');
    expect(res.result.title).toBe('Fallback');
  });
});

describe('sc:resolveMore', () => {
  it('returns the next playlist page', async () => {
    vi.mocked(sc.scResolve).mockResolvedValueOnce({
      kind: 'playlist',
      playlist: { id: 555, title: 'P', track_count: 10 }
    });
    vi.mocked(sc.scPlaylistTracks).mockResolvedValueOnce({ items: [VIDEO_ITEM] });
    const res = (await call('sc:resolveMore', {
      url: 'https://soundcloud.com/artist/sets/best-of',
      start: 1,
      end: 30
    })) as { success: boolean; items: unknown[] };
    expect(res.success).toBe(true);
    expect(res.items).toHaveLength(1);
  });
});

describe('sc:channel and sc:channelAll', () => {
  it('loads a profile page with metadata and tracks', async () => {
    vi.mocked(sc.scResolve).mockResolvedValueOnce({
      kind: 'user',
      user: {
        id: 7,
        username: 'Artist',
        permalink: 'artist',
        avatar_url: 'https://i1.sndcdn.com/avatars-abc-large.jpg',
        followers_count: 10,
        track_count: 1,
        description: 'bio'
      }
    });
    vi.mocked(sc.scUserTracks).mockResolvedValueOnce({ items: [VIDEO_ITEM], total: null });
    const res = (await call('sc:channel', { url: 'https://soundcloud.com/artist' })) as {
      success: boolean;
      channel: { id: string; title: string; thumbnail: string };
      items: unknown[];
    };
    expect(res.success).toBe(true);
    expect(res.channel).toMatchObject({ id: 'artist', title: 'Artist' });
    expect(res.channel.thumbnail).toBe('https://i1.sndcdn.com/avatars-abc-t500x500.jpg');
    expect(res.items).toHaveLength(1);
  });

  it('loads the whole profile in a single call', async () => {
    vi.mocked(sc.scProfileSnapshot).mockResolvedValueOnce({
      channel: {
        id: 'artist',
        url: 'https://soundcloud.com/artist',
        title: 'Artist',
        thumbnail: 'https://i1.sndcdn.com/avatars-abc-t500x500.jpg',
        followerCount: 10,
        trackCount: 1,
        description: 'bio'
      },
      items: [VIDEO_ITEM]
    });
    const res = (await call('sc:channelAll', { url: 'https://soundcloud.com/artist' })) as {
      success: boolean;
      channel: { id: string };
      items: unknown[];
    };
    expect(res.success).toBe(true);
    expect(res.channel.id).toBe('artist');
    expect(res.items).toHaveLength(1);
  });
});

describe('sc:stream:get', () => {
  it('delegates to the stream resolver', async () => {
    const { getScStreamUrl } = await import('../soundcloud/soundcloud-stream');
    vi.mocked(getScStreamUrl).mockResolvedValueOnce({ success: true, url: 'https://cdn/x.mp3' });
    const res = (await call('sc:stream:get', 'https://soundcloud.com/artist/my-song')) as {
      success: boolean;
      url?: string;
    };
    expect(res).toEqual({ success: true, url: 'https://cdn/x.mp3' });
  });
});
