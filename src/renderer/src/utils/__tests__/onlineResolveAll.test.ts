import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectPlatform: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('@shared/platform', () => ({ detectPlatform: mocks.detectPlatform }));

import { RESOLVED_AUTO_CAP, resolveAllPlaylistItems } from '../onlineResolveAll';
import type { YouTubeResolvedItem } from '@renderer/types/online';

function item(id: string): YouTubeResolvedItem {
  return {
    id,
    title: id,
    thumbnail: `${id}.jpg`,
    channelTitle: 'Channel',
    channelId: 'channel'
  };
}

beforeEach(() => {
  mocks.detectPlatform.mockReset().mockReturnValue({ platform: 'youtube' });
  mocks.invoke.mockReset();
  (window as unknown as { api: unknown }).api = { invoke: mocks.invoke };
});

describe('resolveAllPlaylistItems', () => {
  it('returns the first page directly when there is no more data', async () => {
    mocks.invoke.mockResolvedValue({
      success: true,
      result: { items: [item('a'), item('b')], meta: { hasMore: false, totalItems: 2 } }
    });

    const result = await resolveAllPlaylistItems('https://youtube.com/playlist?list=PL');

    expect(mocks.invoke).toHaveBeenCalledWith('yt:resolve', 'https://youtube.com/playlist?list=PL');
    expect(result).toEqual({ items: [item('a'), item('b')], totalItems: 2 });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('uses SoundCloud channels for SoundCloud urls', async () => {
    mocks.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    mocks.invoke.mockResolvedValue({
      success: true,
      result: { items: [item('sc1')], meta: {} }
    });

    await resolveAllPlaylistItems('https://soundcloud.com/user/sets/one');

    expect(mocks.invoke).toHaveBeenCalledWith('sc:resolve', 'https://soundcloud.com/user/sets/one');
  });

  it('returns an empty result for failed or malformed resolves', async () => {
    mocks.invoke.mockResolvedValueOnce({ success: false, result: { items: [], meta: {} } });
    await expect(resolveAllPlaylistItems('u')).resolves.toEqual({ items: [], totalItems: null });

    mocks.invoke.mockResolvedValueOnce(undefined);
    await expect(resolveAllPlaylistItems('u')).resolves.toEqual({ items: [], totalItems: null });
  });

  it('walks subsequent pages, deduplicates and updates the total', async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        success: true,
        result: {
          items: [item('a'), item('b')],
          meta: { hasMore: true, totalItems: 10 }
        }
      })
      .mockResolvedValueOnce({
        success: true,
        items: [item('b'), item('c')],
        hasMore: true,
        totalItems: 11
      })
      .mockResolvedValueOnce({
        success: true,
        items: [item('d')],
        hasMore: true,
        totalItems: 11
      });

    const result = await resolveAllPlaylistItems('u');

    expect(result.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.totalItems).toBe(11);
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'yt:resolveMore', {
      url: 'u',
      start: 3,
      end: 202
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'yt:resolveMore', {
      url: 'u',
      start: 4,
      end: 203
    });
  });

  it('stops when a page is empty, failed or has no more flag', async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        success: true,
        result: { items: [item('a')], meta: { hasMore: true } }
      })
      .mockResolvedValueOnce({ success: true, items: [], hasMore: true });

    await resolveAllPlaylistItems('u');
    expect(mocks.invoke).toHaveBeenCalledTimes(2);

    mocks.invoke
      .mockResolvedValueOnce({
        success: true,
        result: { items: [item('a')], meta: { hasMore: true } }
      })
      .mockResolvedValueOnce({ success: false, items: [item('b')], hasMore: true });
    await resolveAllPlaylistItems('u');
    expect(mocks.invoke).toHaveBeenCalledTimes(4);

    mocks.invoke
      .mockResolvedValueOnce({
        success: true,
        result: { items: [item('a')], meta: { hasMore: true } }
      })
      .mockResolvedValueOnce({ success: true, items: [item('b')], hasMore: false });
    await resolveAllPlaylistItems('u');
    expect(mocks.invoke).toHaveBeenCalledTimes(6);
  });

  it('respects the cap when requesting and continuing', async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        success: true,
        result: { items: [item('a'), item('b')], meta: { hasMore: true } }
      })
      .mockResolvedValueOnce({
        success: true,
        items: [item('c')],
        hasMore: true
      });

    const result = await resolveAllPlaylistItems('u', 3);

    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'yt:resolveMore', {
      url: 'u',
      start: 3,
      end: 3
    });
    expect(result.items.length).toBeGreaterThanOrEqual(3);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('exposes the default auto cap', () => {
    expect(RESOLVED_AUTO_CAP).toBe(500);
  });
});
