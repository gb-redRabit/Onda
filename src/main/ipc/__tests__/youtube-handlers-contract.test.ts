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
    e2e: { enabled: false },
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

vi.mock('../../e2e-fixtures', () => ({ e2eFixturesEnabled: () => h.e2e.enabled }));

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
import { getStreamUrl } from '../youtube/youtube-stream';
import { registerYoutubeHandlers } from '../youtube/youtube-handlers';
import { resetChannelPlaylistCache } from '../youtube/youtube-channel';
import { resetClientIdCache } from '../soundcloud/soundcloud-client';

const runYtDlpMock = vi.mocked(runYtDlp);
const fetchEntryJsonMock = vi.mocked(fetchEntryJson);
const fetchRangeJsonMock = vi.mocked(fetchRangeJson);
const getStreamUrlMock = vi.mocked(getStreamUrl);

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
  h.e2e.enabled = false;
  resetClientIdCache();
  resetChannelPlaylistCache();
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
    expect(res.channel.videoCount).toBe(2);
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

// Regresja: yt:channel pokazywał liczbę filmów tylko z pierwszej strony yt-dlp
// (np. 30 zamiast 107), bo playlist_count przy --playlist-start/--playlist-end
// zwracał rozmiar strony. Licznik musi pochodzić z PEŁNEJ listy, a stronicowanie
// odbywać się w JS.
function channelFixture(count: number, playlistCount?: number) {
  return {
    id: 'UCbig',
    channel: 'Big',
    channel_follower_count: 1000,
    ...(playlistCount === undefined ? {} : { playlist_count: playlistCount }),
    thumbnails: [{ url: 'https://yt3.ggpht.com/avatar', width: 88, height: 88 }],
    entries: Array.from({ length: count }, (_, i) => ({
      id: `vid${i}`,
      title: `Video ${i}`,
      thumbnails: thumb(`vid${i}`)
    }))
  };
}

describe('yt:channel count + pagination (regression)', () => {
  it('does not pass yt-dlp pagination flags', async () => {
    runYtDlpMock.mockResolvedValueOnce(JSON.stringify(channelFixture(2, 2)));
    await call('yt:channel', { url: 'https://www.youtube.com/channel/UCbig', start: 1, end: 30 });
    const args = runYtDlpMock.mock.calls[0][0] as string[];
    expect(args).toContain('--flat-playlist');
    expect(args).not.toContain('--playlist-start');
    expect(args).not.toContain('--playlist-end');
  });

  it('reports the full channel count, not the size of the returned page', async () => {
    // 30 wpisów w odpowiedzi, ale kanał ma 107 filmów (dokładnie zgłoszony objaw).
    runYtDlpMock.mockResolvedValueOnce(JSON.stringify(channelFixture(30, 107)));
    const res = (await call('yt:channel', {
      url: 'https://www.youtube.com/channel/UCbig',
      start: 1,
      end: 30
    })) as { items: unknown[]; channel: { videoCount?: number }; hasMore: boolean };
    expect(res.items).toHaveLength(30);
    expect(res.channel.videoCount).toBe(107);
    expect(res.hasMore).toBe(true);
  });

  it('slices the requested page in JS and computes hasMore from the total', async () => {
    runYtDlpMock.mockResolvedValueOnce(JSON.stringify(channelFixture(5, 5)));
    const res = (await call('yt:channel', {
      url: 'https://www.youtube.com/channel/UCbig',
      start: 2,
      end: 3
    })) as { items: Array<{ id: string }>; channel: { videoCount?: number }; hasMore: boolean };
    expect(res.items.map((i) => i.id)).toEqual(['vid1', 'vid2']);
    expect(res.channel.videoCount).toBe(5);
    expect(res.hasMore).toBe(true);
  });

  it('falls back to the item count when playlist_count is absent', async () => {
    runYtDlpMock.mockResolvedValueOnce(JSON.stringify(channelFixture(3)));
    const res = (await call('yt:channel', {
      url: 'https://www.youtube.com/channel/UCbig',
      start: 1,
      end: 30
    })) as { channel: { videoCount?: number }; hasMore: boolean };
    expect(res.channel.videoCount).toBe(3);
    expect(res.hasMore).toBe(false);
  });

  it('serves repeated page loads from cache with a single yt-dlp call', async () => {
    runYtDlpMock.mockResolvedValue(JSON.stringify(channelFixture(90, 90)));
    await call('yt:channel', {
      url: 'https://www.youtube.com/channel/UCcached',
      start: 1,
      end: 30
    });
    await call('yt:channel', {
      url: 'https://www.youtube.com/channel/UCcached',
      start: 31,
      end: 60
    });
    expect(runYtDlpMock).toHaveBeenCalledTimes(1);
  });
});
describe('yt:resolve external and E2E paths', () => {
  it('returns an E2E marker for external links when fixtures are enabled', async () => {
    h.e2e.enabled = true;
    const res = (await call('yt:resolve', 'https://mirror.example/video')) as {
      success: boolean;
      result: { items: Array<{ id: string; url: string }> };
    };

    expect(res.success).toBe(true);
    expect(res.result.items[0]).toMatchObject({
      id: 'external-e2e-media',
      url: 'https://mirror.example/video'
    });
    expect(fetchEntryJsonMock).not.toHaveBeenCalled();
  });

  it('disables the yt-dlp path for YouTube links when E2E fixtures are enabled', async () => {
    h.e2e.enabled = true;
    const res = (await call('yt:resolve', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')) as {
      success: boolean;
      error: string;
    };

    expect(res).toMatchObject({ success: false, error: 'e2e fixtures: resolve disabled' });
    expect(fetchEntryJsonMock).not.toHaveBeenCalled();
  });

  it('rejects non-http input', async () => {
    const res = (await call('yt:resolve', 'not a link')) as { success: boolean; error: string };

    expect(res).toMatchObject({ success: false, error: 'Paste a valid public http(s) link' });
  });

  it('maps an external playlist and reports hasMore', async () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({
      id: `ext${i}`,
      title: `Ext ${i}`,
      webpage_url: `https://example.com/v/${i}`
    }));
    fetchEntryJsonMock.mockResolvedValueOnce({
      _type: 'playlist',
      title: 'External list',
      playlist_count: 60,
      entries
    });

    const res = (await call('yt:resolve', 'https://example.com/list')) as {
      success: boolean;
      result: {
        kind: string;
        title: string;
        meta: { totalItems: number; hasMore: boolean; channelId: string };
        items: unknown[];
      };
    };

    expect(res.success).toBe(true);
    expect(res.result.kind).toBe('playlist');
    expect(res.result.title).toBe('External list');
    expect(res.result.meta).toMatchObject({ totalItems: 60, hasMore: true });
    expect(res.result.items).toHaveLength(30);
  });

  it('reports links with no playable entries', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({ entries: [] });
    const res = (await call('yt:resolve', 'https://example.com/empty')) as {
      success: boolean;
      error: string;
    };

    expect(res).toMatchObject({
      success: false,
      error: 'This site did not return playable media'
    });
  });

  it('classifies external extractor failures', async () => {
    fetchEntryJsonMock.mockRejectedValueOnce('plain failure');
    const res = (await call('yt:resolve', 'https://example.com/broken')) as {
      success: boolean;
      error: string;
      code: string;
    };

    expect(res.success).toBe(false);
    expect(res.error).toBe('plain failure');
    expect(res.code).toBeTruthy();

    fetchEntryJsonMock.mockRejectedValueOnce(new Error(''));
    const empty = (await call('yt:resolve', 'https://example.com/empty-error')) as {
      error: string;
    };
    expect(empty.error).toBe('Error');
  });

  it('rejects video info without an id or title', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({ id: 'x' });
    const res = (await call('yt:resolve', 'https://www.youtube.com/watch?v=aaaaaaaaaaa')) as {
      success: boolean;
      error: string;
    };

    expect(res).toMatchObject({ success: false, error: 'Could not read video info' });
  });

  it('leaves totalItems unknown when the playlist count is missing', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({
      _type: 'playlist',
      title: 'No count',
      entries: PLAYLIST_PARSED.entries
    });
    const res = (await call('yt:resolve', 'https://www.youtube.com/playlist?list=PLx')) as {
      success: boolean;
      result: { meta: { totalItems: number | null; hasMore: boolean } };
    };

    expect(res.result.meta.totalItems).toBeNull();
    expect(res.result.meta.hasMore).toBe(false);
  });

  it('accepts entries identified by url, webpage_url or title alone', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({
      _type: 'playlist',
      title: 'Mixed',
      entries: [
        { webpage_url: 'https://example.com/w' },
        { url: 'https://example.com/u' },
        { title: 'Only title' },
        {}
      ]
    });

    const res = (await call('yt:resolve', 'https://example.com/mixed')) as {
      result: { items: unknown[] };
    };

    expect(res.result.items).toHaveLength(3);
  });

  it('falls back to the request URL as the external title', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({ entries: [{ id: 'ext' }] });

    const res = (await call('yt:resolve', 'https://example.com/untitled')) as {
      result: { title: string };
    };

    expect(res.result.title).toBe('https://example.com/untitled');
  });

  it('handles an external playlist without entries', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({ _type: 'playlist', title: 'Empty' });

    const res = (await call('yt:resolve', 'https://example.com/no-entries')) as {
      success: boolean;
      error: string;
    };

    expect(res).toMatchObject({
      success: false,
      error: 'This site did not return playable media'
    });
  });

  it('defaults missing video channel metadata', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({ id: 'v1', title: 'Bare video' });

    const res = (await call('yt:resolve', 'https://www.youtube.com/watch?v=bbbbbbbbbbb')) as {
      result: { meta: { channelId: string; channelTitle: string } };
    };

    expect(res.result.meta).toEqual({ channelId: '', channelTitle: '' });
  });

  it('defaults a missing playlist title to an empty string', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({
      _type: 'playlist',
      entries: [{ id: 'p1', title: 'P1' }]
    });

    const res = (await call('yt:resolve', 'https://www.youtube.com/playlist?list=PLz')) as {
      result: { title: string };
    };

    expect(res.result.title).toBe('');
  });

  it('reports hasMore for a full page when the playlist is longer', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({
      _type: 'playlist',
      title: 'Long',
      playlist_count: 100,
      entries: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, title: `P${i}` }))
    });

    const res = (await call('yt:resolve', 'https://www.youtube.com/playlist?list=PLlong')) as {
      result: { meta: { hasMore: boolean; totalItems: number } };
    };

    expect(res.result.meta).toMatchObject({ hasMore: true, totalItems: 100 });
  });

  it('reports hasMore for a full page with an unknown playlist length', async () => {
    fetchEntryJsonMock.mockResolvedValueOnce({
      _type: 'playlist',
      title: 'Longer',
      entries: Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, title: `Q${i}` }))
    });

    const res = (await call('yt:resolve', 'https://www.youtube.com/playlist?list=PLunknown')) as {
      result: { meta: { hasMore: boolean } };
    };

    expect(res.result.meta.hasMore).toBe(true);
  });

  it('falls back to a generic error message when the failure has none', async () => {
    fetchEntryJsonMock.mockRejectedValueOnce(new Error(''));
    const res = (await call('yt:resolve', 'https://www.youtube.com/watch?v=ccccccccccc')) as {
      error: string;
    };
    expect(res.error).toBe('Could not resolve this link');

    fetchEntryJsonMock.mockRejectedValueOnce('string failure');
    const nonError = (await call('yt:resolve', 'https://www.youtube.com/watch?v=ddddddddddd')) as {
      error: string;
    };
    expect(nonError.error).toBe('Could not resolve this link');
  });
});

describe('yt:resolveMore pagination and failures', () => {
  it('rejects missing options', async () => {
    const res = (await call('yt:resolveMore', null)) as { success: boolean };

    expect(res.success).toBe(false);
  });

  it('handles external links with the generic extractor and clamped ranges', async () => {
    fetchRangeJsonMock.mockResolvedValueOnce({ entries: PLAYLIST_PARSED.entries });
    const res = (await call('yt:resolveMore', {
      url: 'https://example.com/list',
      start: 0,
      end: 9999
    })) as { success: boolean; items: unknown[] };

    expect(res.success).toBe(true);
    expect(fetchRangeJsonMock).toHaveBeenCalledWith('https://example.com/list', 1, 200, 'generic');
    expect(res.items).toHaveLength(2);
  });

  it('defaults the end of the range when it is missing or zero', async () => {
    fetchRangeJsonMock.mockResolvedValueOnce({ entries: [] });

    await call('yt:resolveMore', { url: 'https://example.com/list', start: 5, end: 0 });

    expect(fetchRangeJsonMock).toHaveBeenCalledWith('https://example.com/list', 5, 34, 'generic');
  });

  it('reports more pages for a full page with a known or unknown total', async () => {
    const fullPage = {
      playlist_count: 100,
      entries: Array.from({ length: 30 }, (_, i) => ({ id: `v${i}`, title: `V${i}` }))
    };
    fetchRangeJsonMock.mockResolvedValueOnce(fullPage);
    const known = (await call('yt:resolveMore', {
      url: 'https://www.youtube.com/playlist?list=PL123',
      start: 1,
      end: 30
    })) as { hasMore: boolean; totalItems: number };
    expect(known).toMatchObject({ hasMore: true, totalItems: 100 });

    fetchRangeJsonMock.mockResolvedValueOnce({
      entries: Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, title: `W${i}` }))
    });
    const unknown = (await call('yt:resolveMore', {
      url: 'https://www.youtube.com/playlist?list=PL123',
      start: 1,
      end: 30
    })) as { hasMore: boolean; totalItems: number | null };
    expect(unknown).toMatchObject({ hasMore: true, totalItems: null });
  });

  it('returns a classified failure when pagination fails', async () => {
    fetchRangeJsonMock.mockRejectedValueOnce(new Error('boom'));
    const res = (await call('yt:resolveMore', {
      url: 'https://www.youtube.com/playlist?list=PL123',
      start: 1,
      end: 30
    })) as { success: boolean; error: string; items: unknown[] };

    expect(res).toMatchObject({ success: false, error: 'boom', items: [] });

    fetchRangeJsonMock.mockRejectedValueOnce(new Error(''));
    const empty = (await call('yt:resolveMore', {
      url: 'https://www.youtube.com/playlist?list=PL123',
      start: 1,
      end: 30
    })) as { error: string };
    expect(empty.error).toBe('Could not load more items');
  });
});

describe('yt:stream:get', () => {
  it('delegates to the stream resolver', async () => {
    const stream = { success: true, url: 'https://stream.example/audio' };
    getStreamUrlMock.mockResolvedValueOnce(stream as never);

    await expect(call('yt:stream:get', 'https://youtu.be/x')).resolves.toEqual(stream);
    expect(getStreamUrlMock).toHaveBeenCalledWith('https://youtu.be/x');
  });
});
