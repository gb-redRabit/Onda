import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  invoke: vi.fn()
}));

import { createOnlineSearch } from '../search';

function video(id: string) {
  return { id, title: id } as never;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function respond(yt: unknown, sc: unknown) {
  state.invoke.mockImplementation(async (channel: string) => {
    if (channel === 'yt:search') return yt;
    if (channel === 'sc:search') return sc;
    return undefined;
  });
}

beforeEach(() => {
  state.invoke.mockReset();
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

describe('searchOnline', () => {
  it('merges YouTube and SoundCloud results', async () => {
    respond(
      { success: true, items: [video('yt1')] },
      { success: true, items: [video('sc1'), video('sc2')] }
    );
    const search = createOnlineSearch();

    const res = await search.searchOnline('query');

    expect(state.invoke.mock.calls).toEqual([
      ['yt:search', 'query'],
      ['sc:search', 'query']
    ]);
    expect(res).toEqual({ success: true, items: [video('yt1'), video('sc1'), video('sc2')] });
    expect(search.hasMoreSc.value).toBe(false);
  });

  it('marks SoundCloud as having more at 100 items', async () => {
    const scItems = Array.from({ length: 100 }, (_, i) => video(`sc${i}`));
    respond({ success: true, items: [] }, { success: true, items: scItems });
    const search = createOnlineSearch();

    await search.searchOnline('query');

    expect(search.hasMoreSc.value).toBe(true);
  });

  it('surfaces only YouTube results when SoundCloud fails', async () => {
    respond({ success: true, items: [video('yt1')] }, { success: false, error: 'sc down' });
    const search = createOnlineSearch();

    const res = await search.searchOnline('query');

    expect(res.items).toEqual([video('yt1')]);
    expect(res.success).toBe(true);
  });

  it('accepts a SoundCloud-only success', async () => {
    respond({ success: false, error: 'yt down' }, { success: true, items: [video('sc1')] });
    const search = createOnlineSearch();

    await expect(search.searchOnline('query')).resolves.toEqual({
      success: true,
      items: [video('sc1')]
    });
  });

  it('reports the YouTube error when both fail', async () => {
    respond({ success: false, error: 'quota', code: 'quota' }, { success: false, error: 'sc' });
    const search = createOnlineSearch();

    await expect(search.searchOnline('query')).resolves.toEqual({
      success: false,
      error: 'quota',
      code: 'quota',
      items: []
    });
  });

  it('falls back to a generic error message', async () => {
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'yt:search') throw new Error('yt');
      return { success: false };
    });
    const search = createOnlineSearch();

    await expect(search.searchOnline('query')).resolves.toEqual({
      success: false,
      error: 'Search failed',
      code: undefined,
      items: []
    });
  });

  it('ignores pagination from a superseded request', async () => {
    const ytFirst = deferred<unknown>();
    const ytSecond = deferred<unknown>();
    let ytCalls = 0;
    let scCalls = 0;
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'yt:search') {
        ytCalls++;
        return ytCalls === 1 ? ytFirst.promise : ytSecond.promise;
      }
      scCalls++;
      return scCalls === 1
        ? { success: true, items: [video('s1'), video('s2'), video('s3')] }
        : { success: true, items: [video('fresh')] };
    });
    const search = createOnlineSearch();

    const stale = search.searchOnline('old');
    await Promise.resolve();
    const fresh = search.searchOnline('new');

    ytSecond.resolve({ success: true, items: [] });
    await fresh;
    ytFirst.resolve({ success: true, items: [] });
    await stale;

    search.searchQuery.value = 'new';
    search.hasMoreSc.value = true;
    state.invoke.mockClear();
    state.invoke.mockResolvedValueOnce({ success: true, items: [] });
    await search.loadMoreSearch();

    // The fresh request left the offset at 1; the stale 3-item page must not win.
    expect(state.invoke).toHaveBeenCalledWith('sc:search', 'new', 1);
  });
});

describe('loadMoreSearch', () => {
  async function primed() {
    respond({ success: true, items: [video('yt1')] }, { success: true, items: [video('sc1')] });
    const search = createOnlineSearch();
    await search.searchOnline('query');
    search.setResults([video('yt1'), video('sc1')]);
    search.searchQuery.value = 'query';
    state.invoke.mockClear();
    return search;
  }

  it('guards missing query, loading and exhausted results', async () => {
    const search = createOnlineSearch();
    await search.loadMoreSearch();
    expect(state.invoke).not.toHaveBeenCalled();

    search.searchQuery.value = 'q';
    await search.loadMoreSearch();
    expect(state.invoke).not.toHaveBeenCalled();

    search.hasMoreSc.value = true;
    search.searchLoadingMore.value = true;
    await search.loadMoreSearch();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('appends deduplicated results and advances the offset', async () => {
    const search = await primed();
    search.hasMoreSc.value = true;
    const items = [video('sc1'), video('sc2')];
    state.invoke.mockResolvedValueOnce({ success: true, items });

    await search.loadMoreSearch();

    expect(state.invoke).toHaveBeenCalledWith('sc:search', 'query', 1);
    expect(search.searchResults.value.map((i) => i.id)).toEqual(['yt1', 'sc1', 'sc2']);
    expect(search.searchLoadingMore.value).toBe(false);
    expect(search.hasMoreSc.value).toBe(false);
  });

  it('keeps loading more at a full page', async () => {
    const search = await primed();
    search.hasMoreSc.value = true;
    state.invoke.mockResolvedValueOnce({
      success: true,
      items: Array.from({ length: 100 }, (_, i) => video(`more${i}`))
    });

    await search.loadMoreSearch();

    expect(search.hasMoreSc.value).toBe(true);
  });

  it('stops when the page is unusable', async () => {
    const search = await primed();
    search.hasMoreSc.value = true;
    state.invoke.mockResolvedValueOnce({ success: true, items: [] });
    await search.loadMoreSearch();
    expect(search.hasMoreSc.value).toBe(false);

    search.hasMoreSc.value = true;
    state.invoke.mockResolvedValueOnce(null);
    await search.loadMoreSearch();
    expect(search.hasMoreSc.value).toBe(false);

    search.hasMoreSc.value = true;
    state.invoke.mockResolvedValueOnce({ success: false, items: [video('x')] });
    await search.loadMoreSearch();
    expect(search.hasMoreSc.value).toBe(false);
  });

  it('swallows request failures', async () => {
    const search = await primed();
    search.hasMoreSc.value = true;
    state.invoke.mockRejectedValueOnce(new Error('offline'));

    await expect(search.loadMoreSearch()).resolves.toBeUndefined();

    expect(search.hasMoreSc.value).toBe(false);
    expect(search.searchLoadingMore.value).toBe(false);
  });

  it('deduplicates concurrent calls', async () => {
    const search = await primed();
    search.hasMoreSc.value = true;
    const pending = deferred<unknown>();
    state.invoke.mockReturnValueOnce(pending.promise);

    const first = search.loadMoreSearch();
    const second = search.loadMoreSearch();
    expect(state.invoke).toHaveBeenCalledTimes(1);

    pending.resolve({ success: true, items: [video('sc2')] });
    await Promise.all([first, second]);
    expect(search.searchResults.value.map((i) => i.id)).toEqual(['yt1', 'sc1', 'sc2']);
  });

  it('drops a page from a superseded query', async () => {
    const search = await primed();
    search.hasMoreSc.value = true;
    const pending = deferred<unknown>();
    state.invoke.mockReturnValueOnce(pending.promise);
    const loading = search.loadMoreSearch();

    search.clearSearch();
    pending.resolve({ success: true, items: [video('late')] });
    await loading;

    expect(search.searchResults.value).toEqual([]);
    expect(search.hasMoreSc.value).toBe(false);
    expect(search.searchLoadingMore.value).toBe(false);
  });
});

describe('paging', () => {
  function many(count: number) {
    return Array.from({ length: count }, (_, i) => video(`v${i}`));
  }

  it('pages results in chunks of twenty', () => {
    const search = createOnlineSearch();
    search.setResults(many(45), 'next', 'prev');

    expect(search.pagedResults.value).toHaveLength(20);
    expect(search.hasNextPage.value).toBe(true);
    expect(search.hasPrevPage.value).toBe(false);
    expect(search.nextToken.value).toBe('next');
    expect(search.prevToken.value).toBe('prev');

    search.nextSearchPage();
    expect(search.searchPage.value).toBe(1);
    expect(search.hasPrevPage.value).toBe(true);

    search.nextSearchPage();
    search.nextSearchPage();
    expect(search.searchPage.value).toBe(2);
    expect(search.hasNextPage.value).toBe(false);
    expect(search.pagedResults.value).toHaveLength(5);
  });

  it('does not page past the bounds', () => {
    const search = createOnlineSearch();
    search.setResults(many(10));

    search.nextSearchPage();
    expect(search.searchPage.value).toBe(0);
    search.prevSearchPage();
    expect(search.searchPage.value).toBe(0);
    expect(search.nextToken.value).toBeNull();
    expect(search.prevToken.value).toBeNull();
  });

  it('resets to the first page for new results', () => {
    const search = createOnlineSearch();
    search.setResults(many(25));
    search.nextSearchPage();

    search.setResults(many(3));
    expect(search.searchPage.value).toBe(0);
    expect(search.pagedResults.value).toHaveLength(3);
  });
});

describe('clearSearch', () => {
  it('resets all state', async () => {
    respond({ success: true, items: [video('yt')] }, { success: true, items: [video('sc')] });
    const search = createOnlineSearch();
    await search.searchOnline('query');
    search.searchQuery.value = 'query';
    search.setResults([video('a')], 'n', 'p');
    search.hasMoreSc.value = true;

    search.clearSearch();

    expect(search.searchResults.value).toEqual([]);
    expect(search.searchQuery.value).toBe('');
    expect(search.searchPage.value).toBe(0);
    expect(search.hasMoreSc.value).toBe(false);
    expect(search.nextToken.value).toBeNull();
    expect(search.prevToken.value).toBeNull();
  });
});
