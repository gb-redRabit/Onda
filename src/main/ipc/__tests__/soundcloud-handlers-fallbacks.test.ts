import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return { handlers, e2e: false };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      h.handlers.set(channel, fn);
    }
  }
}));
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
vi.mock('../../e2e-fixtures', () => ({ e2eFixturesEnabled: () => h.e2e }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
}));

import * as sc from '../soundcloud/soundcloud-client';
import * as fb from '../soundcloud/soundcloud-fallback';
import * as ch from '../soundcloud/soundcloud-channel-fallback';
import { registerSoundcloudHandlers } from '../soundcloud/soundcloud-handlers';
import { fetchRangeJson } from '../youtube/youtube-handlers';

registerSoundcloudHandlers();

function call(channel: string, ...args: unknown[]): Promise<any> {
  return h.handlers.get(channel)!({}, ...args) as Promise<any>;
}

const VIDEO_ITEM = {
  id: '123',
  title: 'My Song',
  duration: '3:25',
  thumbnail: 'https://i1.sndcdn.com/artworks-abc-t500x500.jpg',
  channelTitle: 'Artist',
  channelId: 'artist',
  isPlayable: true,
  url: 'https://soundcloud.com/artist/my-song'
};

beforeEach(() => {
  vi.clearAllMocks();
  h.e2e = false;
});

describe('sc:search errors', () => {
  it('validates the query and normalises empty results', async () => {
    await expect(call('sc:search', '')).resolves.toEqual({
      success: false,
      error: 'Invalid search query',
      items: []
    });
    await expect(call('sc:search', '   ')).resolves.toEqual(
      expect.objectContaining({ success: false })
    );
    await expect(call('sc:search', 42)).resolves.toEqual(
      expect.objectContaining({ success: false })
    );
    await expect(call('sc:search', 'x'.repeat(201))).resolves.toEqual(
      expect.objectContaining({ success: false })
    );
    await expect(call('sc:search', 'ok')).resolves.toEqual(
      expect.objectContaining({ success: true })
    );
  });

  it('returns no items under e2e fixtures', async () => {
    h.e2e = true;
    await expect(call('sc:search', 'query')).resolves.toEqual({ success: true, items: [] });
    expect(sc.scSearchTracks).not.toHaveBeenCalled();
  });

  it('skips yt-dlp fallback for deeper pages', async () => {
    vi.mocked(sc.scSearchTracks).mockRejectedValueOnce(new Error('api'));
    await expect(call('sc:search', 'query', 25)).resolves.toEqual({
      success: true,
      items: []
    });
    expect(fb.fallbackSearch).not.toHaveBeenCalled();
  });

  it('falls back to yt-dlp search', async () => {
    vi.mocked(sc.scSearchTracks).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fb.fallbackSearch).mockResolvedValueOnce([VIDEO_ITEM] as never);

    await expect(call('sc:search', '  query  ')).resolves.toEqual({
      success: true,
      items: [VIDEO_ITEM]
    });
    expect(fb.fallbackSearch).toHaveBeenCalledWith('query');
  });

  it('reports fallback failures', async () => {
    vi.mocked(sc.scSearchTracks).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fb.fallbackSearch).mockRejectedValueOnce(new Error('yt-dlp down'));

    await expect(call('sc:search', 'query')).resolves.toMatchObject({
      success: false,
      error: 'yt-dlp down',
      items: []
    });
  });

  it('uses a generic message for non-error fallback failures', async () => {
    vi.mocked(sc.scSearchTracks).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fb.fallbackSearch).mockRejectedValueOnce('nope');

    await expect(call('sc:search', 'query')).resolves.toMatchObject({
      success: false,
      error: 'SoundCloud search failed',
      items: []
    });
  });
});

describe('sc:resolve errors', () => {
  it('rejects invalid and discover links', async () => {
    await expect(call('sc:resolve', 'https://example.com/x')).resolves.toEqual({
      success: false,
      error: 'Unsupported or invalid SoundCloud link'
    });
    await expect(
      call('sc:resolve', 'https://soundcloud.com/discover/sets/charts-top:all-music')
    ).resolves.toEqual(expect.objectContaining({ success: false, code: 'unsupported' }));
  });

  it('opens profiles as channel markers', async () => {
    const res = await call('sc:resolve', 'https://soundcloud.com/artist');
    expect(res).toMatchObject({
      success: true,
      result: { kind: 'channel', sourceUrl: 'https://soundcloud.com/artist' }
    });
  });

  it('falls back to yt-dlp for videos and playlists', async () => {
    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fb.fallbackResolvePage).mockResolvedValueOnce({
      title: 'Video',
      totalItems: 1,
      hasMore: false,
      resolvedItems: [VIDEO_ITEM]
    } as never);

    const video = await call('sc:resolve', 'https://soundcloud.com/artist/my-song');
    expect(video.result).toMatchObject({ kind: 'video', title: 'Video', items: [VIDEO_ITEM] });
    expect(fb.fallbackResolvePage).toHaveBeenCalledWith(
      'https://soundcloud.com/artist/my-song',
      'full'
    );

    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fb.fallbackResolvePage).mockResolvedValueOnce({
      title: 'Playlist',
      totalItems: 2,
      hasMore: true,
      resolvedItems: [VIDEO_ITEM]
    } as never);
    const playlist = await call('sc:resolve', 'https://soundcloud.com/artist/sets/x');
    expect(playlist.result).toMatchObject({
      kind: 'playlist',
      title: 'Playlist',
      meta: { totalItems: 2, hasMore: true }
    });
  });

  it('reports resolve failures', async () => {
    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fb.fallbackResolvePage).mockRejectedValueOnce(new Error('fallback'));

    await expect(
      call('sc:resolve', 'https://soundcloud.com/artist/my-song')
    ).resolves.toMatchObject({ success: false, error: 'fallback' });

    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fb.fallbackResolvePage).mockRejectedValueOnce('plain');
    await expect(
      call('sc:resolve', 'https://soundcloud.com/artist/my-song')
    ).resolves.toMatchObject({ success: false, error: 'Could not resolve this link' });
  });
});

describe('sc:resolveMore', () => {
  it('validates options', async () => {
    for (const opts of [
      null,
      {},
      { url: 5 },
      { url: 'https://example.com/x' },
      { url: 'https://soundcloud.com/artist' }
    ]) {
      await expect(call('sc:resolveMore', opts)).resolves.toEqual({
        success: false,
        error: 'Invalid SoundCloud link',
        items: [],
        hasMore: false,
        totalItems: null
      });
    }
  });

  it('clamps the range and returns API pages', async () => {
    vi.mocked(sc.scResolve).mockResolvedValueOnce({
      kind: 'playlist',
      playlist: { id: 9, track_count: 5 }
    } as never);
    vi.mocked(sc.scPlaylistTracks).mockResolvedValueOnce({ items: [VIDEO_ITEM] } as never);

    const res = await call('sc:resolveMore', {
      url: 'https://soundcloud.com/artist/sets/x',
      start: 5,
      end: 999
    });

    expect(sc.scPlaylistTracks).toHaveBeenCalledWith(9, 200, 4);
    expect(res).toMatchObject({ success: true, totalItems: 5, hasMore: false });
  });

  it('returns empty for non-playlist resources', async () => {
    vi.mocked(sc.scResolve).mockResolvedValueOnce({ kind: 'track' } as never);
    await expect(
      call('sc:resolveMore', { url: 'https://soundcloud.com/artist/set', start: 1, end: 30 })
    ).resolves.toEqual({ success: true, items: [], hasMore: false, totalItems: null });

    vi.mocked(sc.scResolve).mockResolvedValueOnce({
      kind: 'playlist',
      playlist: { id: null }
    } as never);
    await expect(
      call('sc:resolveMore', { url: 'https://soundcloud.com/artist/set', start: 1, end: 30 })
    ).resolves.toEqual({ success: true, items: [], hasMore: false, totalItems: null });
  });

  it('falls back to ranged yt-dlp JSON', async () => {
    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fetchRangeJson).mockResolvedValueOnce({
      entries: [
        { title: 'Episode', id: 'e1', url: 'https://soundcloud.com/a/e1' },
        { title: '', id: 'skip' }
      ],
      playlist_count: 2
    } as never);

    const res = await call('sc:resolveMore', {
      url: 'https://soundcloud.com/artist/sets/x',
      start: 1,
      end: 30
    });

    expect(res.success).toBe(true);
    expect(res.items).toHaveLength(1);
    expect(res.totalItems).toBe(2);
  });

  it('reports fallback failures', async () => {
    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fetchRangeJson).mockRejectedValueOnce(new Error('range'));
    await expect(
      call('sc:resolveMore', { url: 'https://soundcloud.com/artist/sets/x', start: 1, end: 30 })
    ).resolves.toMatchObject({ success: false, error: 'range', items: [] });

    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fetchRangeJson).mockRejectedValueOnce('plain');
    await expect(
      call('sc:resolveMore', { url: 'https://soundcloud.com/artist/sets/x', start: 1, end: 30 })
    ).resolves.toMatchObject({ success: false, error: 'Could not load more items' });
  });
});

describe('sc:channel', () => {
  it('validates the profile link', async () => {
    await expect(
      call('sc:channel', { url: 'https://soundcloud.com/artist/my-song' })
    ).resolves.toEqual(expect.objectContaining({ success: false }));
    await expect(call('sc:channel', null)).resolves.toEqual(
      expect.objectContaining({ success: false })
    );
  });

  it('falls back to the yt-dlp channel page', async () => {
    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(ch.fallbackChannelPage).mockResolvedValueOnce({
      channel: { id: 'artist', title: 'Artist' },
      items: [VIDEO_ITEM],
      hasMore: true
    } as never);

    await expect(
      call('sc:channel', { url: 'https://soundcloud.com/artist', start: 1, end: 30 })
    ).resolves.toMatchObject({ success: true, hasMore: true });
  });

  it('reports channel failures', async () => {
    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    const { fallbackChannelPage } = await import('../soundcloud/soundcloud-channel-fallback');
    vi.mocked(fallbackChannelPage).mockRejectedValueOnce(new Error('fallback'));

    await expect(
      call('sc:channel', { url: 'https://soundcloud.com/artist' })
    ).resolves.toMatchObject({ success: false, error: 'fallback', items: [] });

    vi.mocked(sc.scResolve).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fallbackChannelPage).mockRejectedValueOnce('plain');
    await expect(
      call('sc:channel', { url: 'https://soundcloud.com/artist' })
    ).resolves.toMatchObject({ success: false, error: 'Could not load this profile' });
  });
});

describe('sc:channelAll', () => {
  it('validates the link', async () => {
    await expect(call('sc:channelAll', { url: 'https://soundcloud.com/a/b' })).resolves.toEqual({
      success: false,
      error: 'Expected a SoundCloud profile link',
      items: []
    });
    await expect(call('sc:channelAll', null)).resolves.toEqual(
      expect.objectContaining({ success: false })
    );
  });

  it('falls back to yt-dlp for the whole profile', async () => {
    vi.mocked(sc.scProfileSnapshot).mockRejectedValueOnce(new Error('api'));
    const { fallbackChannelAll } = await import('../soundcloud/soundcloud-channel-fallback');
    vi.mocked(fallbackChannelAll).mockResolvedValueOnce({
      channel: { id: 'artist' },
      items: [VIDEO_ITEM]
    } as never);

    await expect(
      call('sc:channelAll', { url: 'https://soundcloud.com/artist' })
    ).resolves.toMatchObject({ success: true, channel: { id: 'artist' } });
  });

  it('reports failures', async () => {
    vi.mocked(sc.scProfileSnapshot).mockRejectedValueOnce(new Error('api'));
    const { fallbackChannelAll } = await import('../soundcloud/soundcloud-channel-fallback');
    vi.mocked(fallbackChannelAll).mockRejectedValueOnce(new Error('fallback'));

    await expect(
      call('sc:channelAll', { url: 'https://soundcloud.com/artist' })
    ).resolves.toMatchObject({ success: false, error: 'fallback', items: [] });

    vi.mocked(sc.scProfileSnapshot).mockRejectedValueOnce(new Error('api'));
    vi.mocked(fallbackChannelAll).mockRejectedValueOnce('plain');
    await expect(
      call('sc:channelAll', { url: 'https://soundcloud.com/artist' })
    ).resolves.toMatchObject({ success: false, error: 'Could not load this profile' });
  });
});
