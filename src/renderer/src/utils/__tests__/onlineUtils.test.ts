import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  detectPlatform: vi.fn(),
  isHttpUrl: vi.fn(),
  ytHandle: vi.fn((name: string) => `https://youtube.com/@${name}`),
  scProfile: vi.fn((name: string) => `https://soundcloud.com/${name}`)
}));

vi.mock('@shared/platform', () => ({
  detectPlatform: h.detectPlatform,
  isHttpUrl: h.isHttpUrl
}));
vi.mock('@shared/provider', () => ({
  buildYouTubeHandleUrl: h.ytHandle,
  buildSoundcloudProfileUrl: h.scProfile
}));

import { channelUrlForPrefix } from '../onlineChannel';
import { resolveDownloadState } from '../onlineItemState';
import { buildQueueExtra } from '../onlineQueueExtra';
import { savedPlaylistId } from '../onlineSavedPlaylist';
import { resolveOnlineUrl } from '../onlineResolve';
import { mergeResolvedPage, normalizeResolvedTotal } from '../onlineResolved';
import { batchResultMessage, pickTextFile } from '../onlineBatch';
import { toResolvedItem } from '../savedItem';

beforeEach(() => {
  h.invoke.mockReset().mockResolvedValue(undefined);
  h.detectPlatform.mockReset().mockReturnValue(null);
  h.isHttpUrl.mockReset().mockReturnValue(true);
  h.ytHandle.mockClear();
  h.scProfile.mockClear();
  (window as unknown as { api: { invoke: typeof h.invoke } }).api = { invoke: h.invoke };
});

describe('channelUrlForPrefix', () => {
  it('builds a YouTube handle url', () => {
    expect(channelUrlForPrefix({ platform: 'youtube', name: 'onda' })).toBe(
      'https://youtube.com/@onda'
    );
    expect(h.ytHandle).toHaveBeenCalledWith('onda');
  });

  it('builds a SoundCloud profile url', () => {
    expect(channelUrlForPrefix({ platform: 'soundcloud', name: 'onda' })).toBe(
      'https://soundcloud.com/onda'
    );
    expect(h.scProfile).toHaveBeenCalledWith('onda');
  });
});

describe('resolveDownloadState', () => {
  it('maps every download status', () => {
    expect(resolveDownloadState(false, null, null)).toBeNull();
    expect(resolveDownloadState(true, null, null)).toBe('queuing');
    expect(resolveDownloadState(false, 'downloading', null)).toBe('downloading');
    expect(resolveDownloadState(false, 'pending', null)).toBe('downloading');
    expect(resolveDownloadState(false, 'paused', null)).toBe('downloading');
    expect(resolveDownloadState(false, 'completed', null)).toBe('done');
    expect(resolveDownloadState(false, 'error', null)).toBeNull();
    expect(resolveDownloadState(false, undefined, undefined)).toBeNull();
  });

  it('keeps a completed task downloading while the cover is fetched', () => {
    expect(resolveDownloadState(false, 'completed', 'fetching')).toBe('downloading');
    expect(resolveDownloadState(false, 'completed', 'done')).toBe('done');
  });
});

describe('buildQueueExtra', () => {
  it('returns an empty payload when nothing is set', () => {
    expect(buildQueueExtra({})).toEqual({});
  });

  it('copies every explicitly set option', () => {
    const extra = buildQueueExtra({
      kind: 'video',
      format: 'mp4',
      quality: '1080p',
      audioQuality: 'best',
      videoContainer: 'mkv',
      filenameTemplate: '{title}',
      cover: { url: 'c' } as never,
      metaOverride: { title: 'T' } as never,
      outputDir: '/out',
      subsLangs: 'pl',
      subsFormat: 'srt',
      subsMode: 'manual',
      subsFolder: true,
      audioLanguage: 'pl',
      sponsorBlock: 'mark',
      trimStart: 1,
      trimEnd: 2
    });

    expect(extra).toEqual({
      kind: 'video',
      format: 'mp4',
      quality: '1080p',
      audioQuality: 'best',
      videoContainer: 'mkv',
      filenameTemplate: '{title}',
      cover: { url: 'c' },
      metaOverride: { title: 'T' },
      outputDir: '/out',
      subsLangs: 'pl',
      subsFormat: 'srt',
      subsMode: 'manual',
      subsFolder: true,
      audioLanguage: 'pl',
      sponsorBlock: 'mark',
      trimStart: 1,
      trimEnd: 2
    });
  });

  it('skips disabled sponsor block and incomplete trims', () => {
    expect(buildQueueExtra({ sponsorBlock: 'off' })).toEqual({});
    expect(buildQueueExtra({ trimStart: 5 })).toEqual({});
    expect(buildQueueExtra({ trimEnd: 5 })).toEqual({});
    expect(buildQueueExtra({ trimStart: 0, trimEnd: 0 })).toEqual({ trimStart: 0, trimEnd: 0 });
  });
});

describe('savedPlaylistId', () => {
  it('uses the source url for channels', () => {
    expect(savedPlaylistId({ kind: 'channel', sourceUrl: 'https://yt/@x?list=1' })).toBe(
      'https://yt/@x?list=1'
    );
  });

  it('prefers the list parameter for playlists', () => {
    expect(
      savedPlaylistId({ kind: 'playlist', sourceUrl: 'https://yt/watch?v=1&list=PL123' })
    ).toBe('PL123');
  });

  it('falls back to the source url without a list parameter', () => {
    expect(savedPlaylistId({ kind: 'playlist', sourceUrl: 'https://yt/watch?v=1' })).toBe(
      'https://yt/watch?v=1'
    );
  });
});

describe('toResolvedItem', () => {
  it('fills optional defaults', () => {
    expect(toResolvedItem({ id: 'a', title: 'A' })).toEqual({
      id: 'a',
      title: 'A',
      thumbnail: '',
      channelTitle: '',
      channelId: '',
      duration: undefined,
      isPlayable: true
    });
  });

  it('keeps the permalink only when present', () => {
    expect(
      toResolvedItem({
        id: 'a',
        title: 'A',
        thumbnail: 't',
        channelTitle: 'C',
        channelId: 'c1',
        duration: '1:00',
        url: 'https://sc/a'
      })
    ).toMatchObject({
      thumbnail: 't',
      channelTitle: 'C',
      channelId: 'c1',
      duration: '1:00',
      url: 'https://sc/a'
    });
  });
});

describe('normalizeResolvedTotal', () => {
  const base = {
    kind: 'playlist' as const,
    title: 'T',
    items: [{ id: '1' }, { id: '2' }],
    meta: { hasMore: false, totalItems: null }
  };

  it('derives the total for a fully loaded playlist', () => {
    expect(normalizeResolvedTotal(base as never)!.meta.totalItems).toBe(2);
  });

  it('leaves other results untouched', () => {
    expect(normalizeResolvedTotal(null)).toBeNull();
    expect(normalizeResolvedTotal({ ...base, kind: 'channel' } as never)).toEqual({
      ...base,
      kind: 'channel'
    });
    expect(normalizeResolvedTotal({ ...base, meta: { hasMore: true } } as never)).toEqual({
      ...base,
      meta: { hasMore: true }
    });
    expect(
      normalizeResolvedTotal({ ...base, meta: { hasMore: false, totalItems: 9 } } as never)
    ).toEqual({ ...base, meta: { hasMore: false, totalItems: 9 } });
  });
});

describe('mergeResolvedPage', () => {
  const current = {
    kind: 'playlist' as const,
    title: 'T',
    items: [{ id: '1' }, { id: '2' }],
    meta: { hasMore: true, totalItems: 10 }
  };

  it('appends only unseen items and updates meta', () => {
    const { resolved, fresh } = mergeResolvedPage(current as never, {
      items: [{ id: '2' }, { id: '3' }] as never,
      hasMore: false,
      totalItems: 12
    });

    expect(fresh).toEqual([{ id: '3' }]);
    expect(resolved.items.map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(resolved.meta).toEqual({ hasMore: false, totalItems: 12 });
  });

  it('keeps the current total when the response omits it', () => {
    const { resolved } = mergeResolvedPage(current as never, { items: [] as never, hasMore: true });

    expect(resolved.meta).toEqual({ hasMore: true, totalItems: 10 });
  });

  it('handles a missing response item list', () => {
    const { resolved, fresh } = mergeResolvedPage(current as never, {});

    expect(fresh).toEqual([]);
    expect(resolved.items).toHaveLength(2);
    expect(resolved.meta).toEqual({ hasMore: undefined, totalItems: 10 });
  });
});

describe('resolveOnlineUrl', () => {
  it('rejects an invalid non-http link', async () => {
    h.isHttpUrl.mockReturnValue(false);

    await expect(resolveOnlineUrl('not-a-url')).resolves.toEqual({
      success: false,
      error: 'Unsupported or invalid link'
    });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('resolves generic http links through YouTube', async () => {
    h.invoke.mockResolvedValue({ success: true, result: { kind: 'video' } });

    await expect(resolveOnlineUrl('https://example.com/a')).resolves.toEqual({
      success: true,
      result: { kind: 'video' }
    });
    expect(h.invoke).toHaveBeenCalledWith('yt:resolve', 'https://example.com/a');
  });

  it('uses the SoundCloud resolver for detected SoundCloud links', async () => {
    h.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    h.invoke.mockResolvedValue({ success: true });

    await resolveOnlineUrl('https://soundcloud.com/x');

    expect(h.invoke).toHaveBeenCalledWith('sc:resolve', 'https://soundcloud.com/x');
  });

  it('uses the YouTube resolver for detected YouTube links', async () => {
    h.detectPlatform.mockReturnValue({ platform: 'youtube' });
    h.invoke.mockResolvedValue({ success: true });

    await resolveOnlineUrl('https://youtube.com/watch?v=1');

    expect(h.invoke).toHaveBeenCalledWith('yt:resolve', 'https://youtube.com/watch?v=1');
  });
});

describe('online batch helpers', () => {
  it('returns the picked file contents', async () => {
    h.invoke
      .mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/list.txt'] })
      .mockResolvedValueOnce('a\nb');

    await expect(pickTextFile((key) => key)).resolves.toBe('a\nb');
    expect(h.invoke).toHaveBeenNthCalledWith(1, 'dialog:openFile', {
      filters: [
        { name: 'youtube.textFiles', extensions: ['txt', 'csv', 'tsv'] },
        { name: 'youtube.allFiles', extensions: ['*'] }
      ]
    });
    expect(h.invoke).toHaveBeenNthCalledWith(2, 'fs:readTextFile', '/tmp/list.txt');
  });

  it('returns null when the dialog is cancelled or empty', async () => {
    h.invoke.mockResolvedValueOnce({ canceled: true, filePaths: ['/x'] });
    await expect(pickTextFile((key) => key)).resolves.toBeNull();

    h.invoke.mockResolvedValueOnce({ canceled: false, filePaths: [] });
    await expect(pickTextFile((key) => key)).resolves.toBeNull();

    h.invoke.mockResolvedValueOnce(undefined);
    await expect(pickTextFile((key) => key)).resolves.toBeNull();
    expect(h.invoke).toHaveBeenCalledTimes(3);
  });

  it('builds the batch result message with and without skips', () => {
    const t = (key: string, params?: Record<string, unknown>) => `${key}:${params?.count}`;

    expect(batchResultMessage(t, 3, 0)).toBe('youtube.batchQueued:3');
    expect(batchResultMessage(t, 3, 2)).toBe('youtube.batchQueued:3 · youtube.batchSkipped:2');
  });
});
