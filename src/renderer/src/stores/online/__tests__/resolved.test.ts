import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  detectPlatform: vi.fn(),
  mergeResolvedPage: vi.fn(),
  normalizeResolvedTotal: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('@shared/platform', () => ({ detectPlatform: state.detectPlatform }));
vi.mock('@renderer/utils/onlineResolved', () => ({
  mergeResolvedPage: state.mergeResolvedPage,
  normalizeResolvedTotal: state.normalizeResolvedTotal
}));

import { createOnlineResolved } from '../resolved';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function item(id: string, playable = true) {
  return { id, title: id, isPlayable: playable } as never;
}

function playlist(ids: string[], hasMore = false, total: number | null = null) {
  return {
    kind: 'playlist',
    sourceUrl: 'https://www.youtube.com/playlist?list=PL1',
    items: ids.map((id) => item(id)),
    meta: { hasMore, totalItems: total }
  } as never;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  state.detectPlatform.mockReset();
  state.detectPlatform.mockReturnValue({ platform: 'youtube' });
  state.mergeResolvedPage.mockReset();
  state.mergeResolvedPage.mockImplementation((current: any, response: any) => ({
    resolved: {
      ...current,
      items: [...current.items, ...response.items],
      meta: { ...current.meta, hasMore: response.hasMore === true }
    },
    fresh: response.items
  }));
  state.normalizeResolvedTotal.mockReset();
  state.normalizeResolvedTotal.mockImplementation((result: any) => result);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ success: true, items: [], hasMore: false });
  (window as unknown as { api: unknown }).api = { invoke: state.invoke };
});

describe('setResolved', () => {
  it('clears everything for a null result', () => {
    const store = createOnlineResolved();
    store.setResolved(playlist(['a']));
    store.setResolved(null);

    expect(store.resolved.value).toBeNull();
    expect(store.selectedResolved.value.size).toBe(0);
    expect(store.resolvedCapped.value).toBe(false);
    expect(store.resolvedLoading.value).toBe(false);
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('selects only playable items', () => {
    const store = createOnlineResolved();
    store.setResolved(playlist(['a', 'b'], false) as never);
    expect([...store.selectedResolved.value]).toEqual(['a', 'b']);

    const mixed = {
      kind: 'playlist',
      sourceUrl: 'https://www.youtube.com/playlist?list=PL1',
      items: [item('a'), item('b', false), item('c')],
      meta: { hasMore: false, totalItems: 3 }
    } as never;
    store.setResolved(mixed);
    expect([...store.selectedResolved.value]).toEqual(['a', 'c']);
  });

  it('normalizes a resolved playlist before storing it', () => {
    const normalized = { ...(playlist(['a']) as object), normalized: true };
    state.normalizeResolvedTotal.mockReturnValueOnce(normalized);
    const store = createOnlineResolved();

    const input = playlist(['a']);
    store.setResolved(input);

    expect(state.normalizeResolvedTotal).toHaveBeenCalledWith(input);
    expect(store.resolved.value).toEqual(normalized);
  });

  it('does not auto-load videos or complete playlists', async () => {
    const store = createOnlineResolved();
    store.setResolved({ kind: 'video', items: [], meta: { hasMore: false } } as never);
    store.setResolved(playlist(['a'], false));
    await flush();

    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('auto-loads the next page and records the exact total', async () => {
    const store = createOnlineResolved();
    store.setResolved(playlist(['a', 'b'], true));
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('yt:resolveMore', {
      url: 'https://www.youtube.com/playlist?list=PL1',
      start: 3,
      end: 32
    });
    expect(store.resolved.value!.meta.totalItems).toBe(2);
    expect(store.resolvedLoading.value).toBe(false);
  });

  it('uses the SoundCloud channel for SC playlists', async () => {
    state.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    const store = createOnlineResolved();
    store.setResolved(playlist(['a'], true));
    await flush();

    expect(state.invoke.mock.calls[0][0]).toBe('sc:resolveMore');
  });

  it('keeps an existing total', async () => {
    const store = createOnlineResolved();
    store.setResolved(playlist(['a'], true, 120));
    await flush();

    expect(store.resolved.value!.meta.totalItems).toBe(120);
  });
});

describe('auto loading', () => {
  it('stops immediately at the auto cap', async () => {
    const store = createOnlineResolved();
    store.setResolved(
      playlist(
        Array.from({ length: 500 }, (_, i) => `i${i}`),
        true
      )
    );
    await flush();

    expect(store.resolvedCapped.value).toBe(true);
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('loads pages until none are left', async () => {
    state.invoke
      .mockResolvedValueOnce({ success: true, items: [item('b')], hasMore: true })
      .mockResolvedValueOnce({ success: true, items: [item('c')], hasMore: false });
    const store = createOnlineResolved();
    store.setResolved(playlist(['a'], true));
    await flush();

    expect(state.invoke).toHaveBeenCalledTimes(2);
    expect(store.resolved.value!.items.map((i: any) => i.id)).toEqual(['a', 'b', 'c']);
    expect(store.resolved.value!.meta.totalItems).toBe(3);
    expect(store.resolvedCapped.value).toBe(false);
  });

  it('marks the cap after a page fills it', async () => {
    state.invoke.mockResolvedValueOnce({ success: true, items: [item('last')], hasMore: true });
    const store = createOnlineResolved();
    store.setResolved(
      playlist(
        Array.from({ length: 499 }, (_, i) => `i${i}`),
        true
      )
    );
    await flush();

    expect(store.resolvedCapped.value).toBe(true);
    expect(store.resolved.value!.items).toHaveLength(500);
  });

  it('keeps the newer result when a stale auto-load finishes', async () => {
    const pending = deferred<unknown>();
    state.invoke.mockReturnValueOnce(pending.promise);
    const store = createOnlineResolved();
    store.setResolved(playlist(['a'], true));
    await flush();

    const newer = playlist(['new'], false, 1);
    store.setResolved(newer);
    pending.resolve({ success: true, items: [item('old')], hasMore: false });
    await flush();

    expect(store.resolved.value).toEqual(newer);
    expect(store.resolvedLoading.value).toBe(false);
  });
});

describe('loadMoreResolved', () => {
  it('merges a page and selects fresh playable items', async () => {
    const store = createOnlineResolved();
    store.setResolved(playlist(['a'], true));
    await flush();
    state.invoke.mockClear();
    state.invoke.mockResolvedValueOnce({
      success: true,
      items: [item('b'), item('c', false)],
      hasMore: true
    });

    await store.loadMoreResolved();

    expect(store.resolved.value!.items.map((i: any) => i.id)).toEqual(['a', 'b', 'c']);
    expect([...store.selectedResolved.value]).toEqual(['a', 'b']);
    expect(store.resolvedCapped.value).toBe(true);
    expect(store.resolvedLoading.value).toBe(false);
  });

  it('does nothing for absent, complete or non-playlist results', async () => {
    const store = createOnlineResolved();
    await store.loadMoreResolved();
    expect(state.invoke).not.toHaveBeenCalled();

    store.setResolved(playlist(['a'], false));
    await store.loadMoreResolved();
    expect(state.invoke).not.toHaveBeenCalled();

    store.setResolved({ kind: 'video', items: [], meta: { hasMore: true } } as never);
    await store.loadMoreResolved();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('ignores unsuccessful or empty pages', async () => {
    const store = createOnlineResolved();
    store.setResolved(playlist(['a'], true));
    await flush();
    state.invoke.mockResolvedValueOnce({ success: false, items: [item('b')], hasMore: true });
    await store.loadMoreResolved();
    expect(store.resolvedCapped.value).toBe(false);

    state.invoke.mockResolvedValueOnce({ success: true, items: [], hasMore: true });
    await store.loadMoreResolved();
    expect(store.resolved.value!.items).toHaveLength(1);
    expect(store.resolvedCapped.value).toBe(false);
  });

  it('deduplicates concurrent requests', async () => {
    const store = createOnlineResolved();
    store.setResolved(playlist(['a'], true));
    await flush();
    state.invoke.mockClear();
    const pending = deferred<unknown>();
    state.invoke.mockReturnValueOnce(pending.promise);

    const first = store.loadMoreResolved();
    const second = store.loadMoreResolved();
    expect(state.invoke).toHaveBeenCalledTimes(1);

    pending.resolve({ success: true, items: [item('b')], hasMore: false });
    await Promise.all([first, second]);
    expect(store.resolvedCapped.value).toBe(false);
  });

  it('drops a page that resolves after the playlist changed', async () => {
    const store = createOnlineResolved();
    store.setResolved(playlist(['a'], true));
    await flush();
    state.invoke.mockClear();
    const pending = deferred<unknown>();
    state.invoke.mockReturnValueOnce(pending.promise);

    const loading = store.loadMoreResolved();
    const newer = playlist(['new'], false, 1);
    store.setResolved(newer);
    pending.resolve({ success: true, items: [item('stale')], hasMore: true });
    await loading;

    expect(store.resolved.value).toEqual(newer);
    expect(store.resolvedCapped.value).toBe(false);
    expect(store.resolvedLoading.value).toBe(false);
  });
});
