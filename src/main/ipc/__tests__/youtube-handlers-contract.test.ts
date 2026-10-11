import { describe, it, expect, vi, beforeEach } from 'vitest';

// Siatka regresyjna dla publicznego kontraktu handlerów `yt:*` (wyszukiwarka,
// resolve/resolveMore, kanały). yt-dlp jest w pełni zamockowany — testy są
// offline i deterministyczne, więc chronią przepływ przy rozbudowie sekcji Online.
// Kontrakt wejście/wyjście IPC nie może się zmienić bez świadomej decyzji.

// Electron: przechwyć zarejestrowane handlery, aby wywoływać je bezpośrednio.
const h = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(ch, fn);
      },
      removeHandler: (ch: string) => {
        handlers.delete(ch);
      }
    }
  };
});

vi.mock('electron', () => ({
  ipcMain: h.ipcMain,
  app: { getPath: () => '' }
}));

// Warstwa uruchamiania yt-dlp — mockowana, żeby nie spawnować procesów i móc
// sterować odpowiedziami JSON.
vi.mock('../youtube/youtube-fetch', () => ({
  runYtDlp: vi.fn(),
  fetchEntryJson: vi.fn(),
  fetchRangeJson: vi.fn()
}));

// Strumieniowanie (spawn yt-dlp -g) poza zakresem tego testu.
vi.mock('../youtube/youtube-stream', () => ({ getStreamUrl: vi.fn() }));

vi.mock('../proxy-utils', () => ({ readNetworkArgs: vi.fn(async () => []) }));

vi.mock('../network-target', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../network-target')>();
  return {
    ...actual,
    resolveNetworkTarget: vi.fn(async () => ({ url: 'https://example.com/', addresses: [] }))
  };
});

import { runYtDlp, fetchEntryJson, fetchRangeJson } from '../youtube/youtube-fetch';
import { registerYoutubeHandlers } from '../youtube/youtube-handlers';
import { resetClientIdCache } from '../soundcloud/soundcloud-client';

const runYtDlpMock = vi.mocked(runYtDlp);
const fetchEntryJsonMock = vi.mocked(fetchEntryJson);
const fetchRangeJsonMock = vi.mocked(fetchRangeJson);

registerYoutubeHandlers();
const call = (channel: string, ...args: unknown[]): unknown => {
  const fn = h.handlers.get(channel);
  if (!fn) throw new Error(`handler not registered: ${channel}`);
  return fn({}, ...args);
};

// ── Fixtures w kształcie wyjścia yt-dlp -J ──────────────────────────────────
const thumb = (id: string) => [
  { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 480, height: 360 }
];

const VIDEO_ENTRY = {
  id: 'dQw4w9WgXcQ',
  title: 'Test Video',
  description: 'desc',
  duration: 212,
  view_count: 1000,
  channel: 'Test Channel',
  channel_id: 'UCtest',
  upload_date: '20240102',
  is_playable: true,
  thumbnails: thumb('dQw4w9WgXcQ')
};

const PLAYLIST_PARSED = {
  _type: 'playlist',
  title: 'My Playlist',
  channel: 'Chan',
  channel_id: 'UCchan',
  playlist_count: 2,
  entries: [
    { id: 'vidAAA', title: 'A', duration: 10, thumbnails: thumb('vidAAA') },
    { id: 'vidBBB', title: 'B', duration: 20, thumbnails: thumb('vidBBB') }
  ]
};

const CHANNEL_PARSED = {
  id: 'UCchan',
  channel: 'Chan',
  channel_follower_count: 5,
  description: 'channel desc',
  playlist_count: 2,
  thumbnails: [{ url: 'https://yt3.ggpht.com/avatar', width: 88, height: 88 }],
  entries: [
    { id: 'vidAAA', title: 'A', duration: 10, thumbnails: thumb('vidAAA') },
    { id: 'vidBBB', title: 'B', duration: 20, thumbnails: thumb('vidBBB') }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  resetClientIdCache();
});

describe('yt:search', () => {
  it('maps yt-dlp search entries into video items', async () => {
    runYtDlpMock.mockResolvedValueOnce(JSON.stringify({ entries: [VIDEO_ENTRY] }));
    const res = (await call('yt:search', 'query')) as {
      success: boolean;
      items: Array<{ id: string; title: string; duration?: string }>;
    };
    expect(res.success).toBe(true);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      id: 'dQw4w9WgXcQ',
      title: 'Test Video',
      duration: '3:32'
    });
    expect(String(runYtDlpMock.mock.calls[0][0][0])).toBe('ytsearch100:query');
  });

  it('rejects an invalid query without spawning yt-dlp', async () => {
    const res = (await call('yt:search', '')) as { success: boolean; items: unknown[] };
    expect(res.success).toBe(false);
    expect(res.items).toEqual([]);
    expect(runYtDlpMock).not.toHaveBeenCalled();
  });

  it('surfaces a classified error when yt-dlp fails', async () => {
    runYtDlpMock.mockRejectedValueOnce(new Error('boom'));
    const res = (await call('yt:search', 'q')) as {
      success: boolean;
      error?: string;
      items: unknown[];
    };
    expect(res.success).toBe(false);
    expect(res.items).toEqual([]);
    expect(res.error).toBe('boom');
  });
});

describe('yt:resolve', () => {
  it('resolves a single video via full info', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce(VIDEO_ENTRY);
    const res = (await call('yt:resolve', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')) as {
      success: boolean;
      result: { kind: string; title: string; items: Array<{ id: string }> };
    };
    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('video');
    expect(res.result.title).toBe('Test Video');
    expect(res.result.items[0].id).toBe('dQw4w9WgXcQ');
    expect(fetchEntryJsonMock.mock.calls[0][1]).toBe('full');
  });

  it('resolves a playlist page and reports hasMore', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce(PLAYLIST_PARSED);
    const res = (await call('yt:resolve', 'https://www.youtube.com/playlist?list=PL123')) as {
      success: boolean;
      result: { kind: string; items: unknown[]; meta: { hasMore: boolean; totalItems: number } };
    };
    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('playlist');
    expect(res.result.items).toHaveLength(2);
    expect(res.result.meta.totalItems).toBe(2);
    expect(res.result.meta.hasMore).toBe(false);
  });

  it('opens a channel with a light marker (no yt-dlp call)', async () => {
    const res = (await call('yt:resolve', 'https://www.youtube.com/channel/UCchan')) as {
      success: boolean;
      result: { kind: string; items: unknown[] };
    };
    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('channel');
    expect(res.result.items).toEqual([]);
    expect(fetchEntryJsonMock).not.toHaveBeenCalled();
  });

  it('resolves an external http link through the generic extractor', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({
      id: 'ext1',
      title: 'External',
      webpage_url: 'https://example.com/video',
      thumbnails: [{ url: 'https://cdn.example.com/t.jpg', width: 100, height: 100 }]
    });
    const res = (await call('yt:resolve', 'https://example.com/video')) as {
      success: boolean;
      result: { kind: string; items: Array<{ id: string; url?: string }> };
    };
    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('video');
    expect(res.result.items[0].url).toBe('https://example.com/video');
    expect(fetchEntryJsonMock.mock.calls[0][2]).toBe('generic');
  });

  it('reports failure with a classified code when info fetch throws', async () => {
    fetchEntryJsonMock.mockRejectedValueOnce(new Error('This video is unavailable'));
    const res = (await call('yt:resolve', 'https://www.youtube.com/watch?v=aaaaaaaaaaa')) as {
      success: boolean;
      error?: string;
      code?: string;
    };
    expect(res.success).toBe(false);
    expect(res.error).toBe('This video is unavailable');
    expect(res.code).toBeTruthy();
  });
});

describe('yt:resolveMore', () => {
  it('returns the requested page and computes hasMore', async () => {
    fetchRangeJsonMock.mockResolvedValueOnce(PLAYLIST_PARSED);
    const res = (await call('yt:resolveMore', {
      url: 'https://www.youtube.com/playlist?list=PL123',
      start: 1,
      end: 30
    })) as { success: boolean; items: unknown[]; hasMore: boolean };
    expect(res.success).toBe(true);
    expect(res.items).toHaveLength(2);
    expect(res.hasMore).toBe(false);
  });

  it('rejects an invalid link without calling yt-dlp', async () => {
    const res = (await call('yt:resolveMore', { url: '', start: 1, end: 30 })) as {
      success: boolean;
    };
    expect(res.success).toBe(false);
    expect(fetchRangeJsonMock).not.toHaveBeenCalled();
  });
});

describe('yt:channel and yt:channelAll', () => {
  it('loads a channel page with metadata and items', async () => {
    runYtDlpMock.mockResolvedValueOnce(JSON.stringify(CHANNEL_PARSED));
    const res = (await call('yt:channel', {
      url: 'https://www.youtube.com/channel/UCchan',
      start: 1,
      end: 30
    })) as {
      success: boolean;
      channel: { id: string; title: string; thumbnail: string; videoCount?: number };
      items: unknown[];
    };
    expect(res.success).toBe(true);
    expect(res.channel).toMatchObject({ id: 'UCchan', title: 'Chan' });
    expect(res.channel.thumbnail).toBe('https://yt3.ggpht.com/avatar');
    expect(res.items).toHaveLength(2);
  });

  it('loads the whole channel in a single call', async () => {
    runYtDlpMock.mockResolvedValueOnce(JSON.stringify(CHANNEL_PARSED));
    const res = (await call('yt:channelAll', {
      url: 'https://www.youtube.com/channel/UCchan'
    })) as { success: boolean; items: unknown[] };
    expect(res.success).toBe(true);
    expect(res.items).toHaveLength(2);
  });
});
