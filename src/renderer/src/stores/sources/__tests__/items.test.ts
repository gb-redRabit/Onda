import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { createSourcesItems } from '../items';
import type { MediaSource, SourceEndpoint, SourceItem } from '@renderer/types/sources';

const state = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock('@renderer/utils/sources-helpers', () => ({
  toPlain: (value: unknown) => value
}));

function source(): MediaSource {
  return {
    id: 's1',
    name: 'Source',
    baseUrl: 'https://api',
    auth: { type: 'none' },
    endpoints: [],
    createdAt: 0
  };
}

function endpoint(overrides: Partial<SourceEndpoint> = {}): SourceEndpoint {
  return {
    id: 'e1',
    name: 'Endpoint',
    method: 'GET',
    path: '/list',
    mapping: { fields: {} },
    ...overrides
  };
}

function item(id: string): SourceItem {
  return { id, title: id, type: 'video' };
}

function setup(
  options: {
    source?: MediaSource | null;
    endpoint?: SourceEndpoint | null;
    mode?: 'page' | 'cursor' | 'none';
    startPage?: number;
  } = {}
) {
  const sourceRef = ref(options.source === undefined ? source() : options.source);
  const endpointRef = ref(options.endpoint === undefined ? endpoint() : options.endpoint);
  const mode = ref(options.mode ?? 'page');
  const start = ref(options.startPage ?? 1);
  const store = createSourcesItems({
    activeSource: computed(() => sourceRef.value),
    activeEndpoint: computed(() => endpointRef.value),
    paginationMode: computed(() => mode.value),
    startPage: computed(() => start.value)
  });
  return { store, sourceRef, endpointRef, mode };
}

beforeEach(() => {
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ items: [], hasMore: false });
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

describe('fetchItems', () => {
  it('clears items when there is no active source or endpoint', async () => {
    const { store, sourceRef } = setup();
    store.items.value = [item('old')];
    store.hasMore.value = true;
    sourceRef.value = null;

    await store.fetchItems();
    expect(store.items.value).toEqual([]);
    expect(store.hasMore.value).toBe(false);
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('fetches the start page with query and context', async () => {
    const { store } = setup({ startPage: 3, mode: 'page' });
    store.context.value = { slug: 'abc' };
    state.invoke.mockResolvedValueOnce({
      items: [item('a')],
      hasMore: true,
      nextFrom: 'next',
      error: 'warning'
    });

    await store.fetchItems({ q: 'x' });

    expect(state.invoke).toHaveBeenCalledWith('sources:fetch', source(), endpoint(), {
      query: { q: 'x' },
      page: 3,
      context: { slug: 'abc' }
    });
    expect(store.currentPage.value).toBe(3);
    expect(store.items.value).toEqual([item('a')]);
    expect(store.hasMore.value).toBe(true);
    expect(store.nextFrom.value).toBe('next');
    expect(store.lastError.value).toBe('warning');
    expect(store.loading.value).toBe(false);
  });

  it('uses cursor mode without a page number', async () => {
    const { store } = setup({ mode: 'cursor' });
    await store.fetchItems();
    expect(state.invoke).toHaveBeenCalledWith(
      'sources:fetch',
      source(),
      endpoint(),
      expect.objectContaining({ page: undefined })
    );
  });

  it('takes table rows from the response', async () => {
    const { store } = setup();
    state.invoke.mockResolvedValueOnce({
      items: [item('a')],
      tableRows: [item('row')]
    });
    await store.fetchItems();
    expect(store.tableRows.value).toEqual([item('row')]);
    expect(state.invoke).toHaveBeenCalledTimes(1);
  });

  it('falls back to the table endpoint for page endpoints', async () => {
    const pageEndpoint = endpoint({ type: 'page', table: { mode: 'endpoint', path: '/rows' } });
    const { store } = setup({ endpoint: pageEndpoint, mode: 'cursor' });
    state.invoke
      .mockResolvedValueOnce({ items: [item('page')] })
      .mockResolvedValueOnce([item('row')]);

    await store.fetchItems();

    expect(state.invoke).toHaveBeenCalledTimes(2);
    expect(state.invoke).toHaveBeenLastCalledWith('sources:tableRows', source(), pageEndpoint, {
      context: null
    });
    expect(store.tableRows.value).toEqual([item('row')]);
  });

  it('does not fall back when the response has an error', async () => {
    const pageEndpoint = endpoint({ type: 'page', table: { mode: 'endpoint', path: '/rows' } });
    const { store } = setup({ endpoint: pageEndpoint });
    state.invoke.mockResolvedValueOnce({ error: 'boom' });

    await store.fetchItems();
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(store.lastError.value).toBe('boom');
  });

  it('captures thrown failures', async () => {
    const { store } = setup();
    state.invoke.mockRejectedValueOnce(new Error('network down'));

    await store.fetchItems();
    expect(store.lastError.value).toBe('network down');
    expect(store.items.value).toEqual([]);
    expect(store.loading.value).toBe(false);

    state.invoke.mockRejectedValueOnce('plain');
    await store.fetchItems();
    expect(store.lastError.value).toBe('plain');
  });

  it('ignores stale responses', async () => {
    const { store } = setup();
    let resolveFirst!: (value: unknown) => void;
    state.invoke
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ items: [item('second')] });

    const first = store.fetchItems();
    const second = store.fetchItems();
    await second;
    resolveFirst({ items: [item('first')] });
    await first;

    expect(store.items.value).toEqual([item('second')]);
  });
});

describe('fetchMore', () => {
  it('advances to the next page and replaces rows', async () => {
    const { store } = setup({ mode: 'page' });
    store.currentPage.value = 2;
    state.invoke.mockResolvedValueOnce({ items: [item('a'), item('b')] });

    await store.fetchMore();

    expect(state.invoke).toHaveBeenCalledWith('sources:fetch', source(), endpoint(), {
      page: 3,
      context: null
    });
    expect(store.currentPage.value).toBe(3);
    expect(store.items.value).toHaveLength(2);
    expect(store.hasMore.value).toBe(true);
  });

  it('keeps the page on error', async () => {
    const { store } = setup({ mode: 'page' });
    store.currentPage.value = 1;
    state.invoke.mockResolvedValueOnce({ error: 'nope', items: [] });

    await store.fetchMore();
    expect(store.currentPage.value).toBe(1);
    expect(store.lastError.value).toBe('nope');
  });

  it('appends cursor results', async () => {
    const { store } = setup({ mode: 'cursor' });
    store.items.value = [item('old')];
    store.nextFrom.value = 'token';
    state.invoke.mockResolvedValueOnce({
      items: [item('new')],
      hasMore: true,
      nextFrom: 'next'
    });

    await store.fetchMore();

    expect(state.invoke).toHaveBeenCalledWith(
      'sources:fetch',
      source(),
      endpoint(),
      expect.objectContaining({ pageToken: 'token' })
    );
    expect(store.items.value.map((entry) => entry.id)).toEqual(['old', 'new']);
    expect(store.hasMore.value).toBe(true);
    expect(store.nextFrom.value).toBe('next');
  });

  it('does nothing while loading, without a source, or without a cursor', async () => {
    const { store, sourceRef } = setup({ mode: 'cursor' });
    store.loading.value = true;
    await store.fetchMore();
    expect(state.invoke).not.toHaveBeenCalled();

    store.loading.value = false;
    store.nextFrom.value = null;
    await store.fetchMore();
    expect(state.invoke).not.toHaveBeenCalled();

    sourceRef.value = null;
    await store.fetchMore();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('ignores stale cursor responses', async () => {
    const { store } = setup({ mode: 'cursor' });
    store.nextFrom.value = 'token';
    let resolveFirst!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));

    const first = store.fetchMore();
    await store.fetchItems();
    resolveFirst({ items: [item('stale')] });
    await first;

    expect(store.items.value).toEqual([]);
  });
});

describe('setPage', () => {
  it('clamps and ignores unchanged pages', async () => {
    const { store } = setup();
    store.currentPage.value = 2;
    await store.setPage(2);
    expect(state.invoke).not.toHaveBeenCalled();

    await store.setPage(0);
    expect(store.currentPage.value).toBe(1);
    expect(state.invoke).toHaveBeenCalledTimes(1);
  });

  it('loads a requested page', async () => {
    const { store } = setup();
    state.invoke.mockResolvedValueOnce({ items: [item('page3')], error: 'warn' });

    await store.setPage(3.8);

    expect(store.currentPage.value).toBe(3);
    expect(state.invoke).toHaveBeenCalledWith('sources:fetch', source(), endpoint(), {
      page: 3,
      context: null
    });
    expect(store.items.value).toEqual([item('page3')]);
    expect(store.hasMore.value).toBe(true);
    expect(store.nextFrom.value).toBeNull();
    expect(store.lastError.value).toBe('warn');
  });

  it('handles failures and missing endpoints', async () => {
    const { store, endpointRef } = setup();
    state.invoke.mockRejectedValueOnce(new Error('bad page'));
    await store.setPage(2);
    expect(store.lastError.value).toBe('bad page');
    expect(store.items.value).toEqual([]);

    endpointRef.value = null;
    await store.setPage(4);
    expect(store.currentPage.value).toBe(4);
  });
});

describe('table rows and reset', () => {
  it('fetches table rows and clears them on failure', async () => {
    const pageEndpoint = endpoint({ type: 'page', table: { mode: 'endpoint', path: '/rows' } });
    const { store } = setup({ endpoint: pageEndpoint });
    state.invoke.mockResolvedValueOnce([item('row')]);
    await store.fetchTableRows();
    expect(store.tableRows.value).toEqual([item('row')]);
    expect(store.tableLoading.value).toBe(false);

    state.invoke.mockRejectedValueOnce(new Error('rows failed'));
    await store.fetchTableRows();
    expect(store.tableRows.value).toEqual([]);
    expect(store.tableLoading.value).toBe(false);
  });

  it('skips table fetches without a table', async () => {
    const { store } = setup();
    await store.fetchTableRows();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('ignores stale table rows', async () => {
    const pageEndpoint = endpoint({ type: 'page', table: { mode: 'endpoint', path: '/rows' } });
    const { store } = setup({ endpoint: pageEndpoint });
    let resolveRows!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(new Promise((resolve) => (resolveRows = resolve)));

    const first = store.fetchTableRows();
    store.resetItems();
    resolveRows([item('stale')]);
    await first;

    expect(store.tableRows.value).toEqual([]);
  });

  it('resets all item state and invalidates pending loads', async () => {
    const { store } = setup();
    store.items.value = [item('a')];
    store.hasMore.value = true;
    store.nextFrom.value = 'x';
    store.tableRows.value = [item('row')];
    store.tableLoading.value = true;
    store.loading.value = true;

    store.resetItems();

    expect(store.items.value).toEqual([]);
    expect(store.hasMore.value).toBe(false);
    expect(store.nextFrom.value).toBeNull();
    expect(store.tableRows.value).toEqual([]);
    expect(store.tableLoading.value).toBe(false);
    expect(store.loading.value).toBe(false);
  });
});
