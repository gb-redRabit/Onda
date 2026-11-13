import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  computePaginationMode: vi.fn()
}));

vi.mock('@renderer/utils/sources-helpers', () => ({
  computePaginationMode: h.computePaginationMode
}));

import { createSourcesList } from '../list';

const api = window as unknown as { api: { invoke: typeof h.invoke } };

function source(id: string, endpoints: { id: string; pagination?: object }[] = []) {
  return { id, name: id, endpoints } as never;
}

beforeEach(() => {
  h.invoke.mockReset().mockResolvedValue([]);
  h.computePaginationMode.mockReset().mockReturnValue('none');
  api.api = { invoke: h.invoke };
});

describe('sources list store', () => {
  it('resolves active source, endpoint and pagination', () => {
    const store = createSourcesList();
    const endpoint = { id: 'e1', pagination: { pageStart: 3 } };
    store.sources.value = [source('s1', [endpoint as never])];
    store.activeSourceId.value = 's1';
    store.activeEndpointId.value = 'e1';
    h.computePaginationMode.mockReturnValue('page');

    expect(store.activeSource.value?.id).toBe('s1');
    expect(store.activeEndpoint.value?.id).toBe('e1');
    expect(store.paginationMode.value).toBe('page');
    expect(store.startPage.value).toBe(3);
    expect(h.computePaginationMode).toHaveBeenCalledWith(endpoint);
  });

  it('defaults page start and missing entities', () => {
    const store = createSourcesList();

    expect(store.activeSource.value).toBeNull();
    expect(store.activeEndpoint.value).toBeNull();
    expect(store.startPage.value).toBe(1);
    expect(store.paginationMode.value).toBe('none');
  });

  it('loads sources without selecting one', async () => {
    h.invoke.mockResolvedValue([source('s1')]);
    const store = createSourcesList();

    await store.loadSources();

    expect(h.invoke).toHaveBeenCalledWith('sources:list');
    expect(store.sources.value).toHaveLength(1);
    expect(store.activeSourceId.value).toBe('');
    expect(store.isLoaded.value).toBe(true);
  });

  it('clears sources on load failure', async () => {
    h.invoke.mockRejectedValue(new Error('ipc'));
    const store = createSourcesList();
    store.sources.value = [source('old')];

    await store.loadSources();

    expect(store.sources.value).toEqual([]);
    expect(store.isLoaded.value).toBe(true);
  });

  it('treats a null load response as empty', async () => {
    h.invoke.mockResolvedValue(null);
    const store = createSourcesList();
    store.sources.value = [source('old')];

    await store.loadSources();

    expect(store.sources.value).toEqual([]);
  });

  it('keeps sources when save omits the list', async () => {
    h.invoke.mockResolvedValue({ saved: null });
    const store = createSourcesList();
    store.sources.value = [source('old')];

    await expect(store.saveSource(source('s1'))).resolves.toEqual({
      ok: false,
      error: 'Invalid source'
    });
    expect(store.sources.value.map((s) => s.id)).toEqual(['old']);
  });

  it('treats a null delete response as empty', async () => {
    h.invoke.mockResolvedValue(null);
    const store = createSourcesList();
    store.sources.value = [source('old')];

    await store.deleteSource('old');

    expect(store.sources.value).toEqual([]);
  });

  it('reports non-Error delete failures', async () => {
    h.invoke.mockRejectedValue('plain');
    const store = createSourcesList();

    await expect(store.deleteSource('s1')).resolves.toEqual({
      ok: false,
      wasActive: false,
      error: 'plain'
    });
  });

  it('saves a source and selects its first endpoint', async () => {
    h.invoke.mockResolvedValue({
      list: [source('s1')],
      saved: source('s1', [{ id: 'e1' } as never])
    });
    const store = createSourcesList();

    await expect(store.saveSource(source('s1'))).resolves.toEqual({ ok: true, id: 's1' });
    expect(store.sources.value).toHaveLength(1);
    expect(store.activeSourceId.value).toBe('s1');
    expect(store.activeEndpointId.value).toBe('e1');
  });

  it('selects a saved source without endpoints', async () => {
    h.invoke.mockResolvedValue({ list: [], saved: source('s1') });
    const store = createSourcesList();

    await store.saveSource(source('s1'));

    expect(store.activeEndpointId.value).toBe('');
  });

  it('reports invalid saves', async () => {
    h.invoke.mockResolvedValue({ list: [], saved: null });
    const store = createSourcesList();

    await expect(store.saveSource(source('s1'))).resolves.toEqual({
      ok: false,
      error: 'Invalid source'
    });
  });

  it('reports save errors', async () => {
    h.invoke.mockRejectedValue(new Error('disk full'));
    const store = createSourcesList();

    await expect(store.saveSource(source('s1'))).resolves.toEqual({
      ok: false,
      error: 'disk full'
    });

    h.invoke.mockRejectedValue('plain');
    await expect(store.saveSource(source('s1'))).resolves.toEqual({
      ok: false,
      error: 'plain'
    });
  });

  it('deletes a source and clears the active selection', async () => {
    h.invoke.mockResolvedValue([]);
    const store = createSourcesList();
    store.activeSourceId.value = 's1';
    store.activeEndpointId.value = 'e1';

    await expect(store.deleteSource('s1')).resolves.toEqual({ ok: true, wasActive: true });
    expect(store.sources.value).toEqual([]);
    expect(store.activeSourceId.value).toBe('');
    expect(store.activeEndpointId.value).toBe('');
  });

  it('keeps the selection when deleting another source', async () => {
    h.invoke.mockResolvedValue([source('s2')]);
    const store = createSourcesList();
    store.activeSourceId.value = 's2';

    await expect(store.deleteSource('s1')).resolves.toEqual({ ok: true, wasActive: false });
    expect(store.activeSourceId.value).toBe('s2');
  });

  it('reports delete errors', async () => {
    h.invoke.mockRejectedValue(new Error('busy'));
    const store = createSourcesList();

    await expect(store.deleteSource('s1')).resolves.toEqual({
      ok: false,
      wasActive: false,
      error: 'busy'
    });
  });

  it('reorders optimistically and applies the persisted list', async () => {
    const store = createSourcesList();
    store.sources.value = [source('a'), source('b'), source('c')];
    h.invoke.mockResolvedValue([source('c'), source('a'), source('b')]);

    await store.reorderSources(['c', 'a']);

    expect(h.invoke).toHaveBeenCalledWith('sources:reorder', ['c', 'a']);
    expect(store.sources.value.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps unknown ids at the end while optimistic', async () => {
    const store = createSourcesList();
    store.sources.value = [source('a'), source('b')];
    let optimisticIds: string[] = [];
    h.invoke.mockImplementation(async () => {
      optimisticIds = store.sources.value.map((s) => s.id);
      return [];
    });

    await store.reorderSources(['b']);

    expect(optimisticIds).toEqual(['b', 'a']);
  });

  it('restores the previous order when reordering fails', async () => {
    const store = createSourcesList();
    const initial = [source('a'), source('b')];
    store.sources.value = initial;
    h.invoke.mockRejectedValue(new Error('ipc'));

    await store.reorderSources(['b', 'a']);

    expect(store.sources.value).toEqual(initial);
  });

  it('keeps the optimistic order when the response is not an array', async () => {
    const store = createSourcesList();
    store.sources.value = [source('a'), source('b')];
    h.invoke.mockResolvedValue(null);

    await store.reorderSources(['b', 'a']);

    expect(store.sources.value.map((s) => s.id)).toEqual(['b', 'a']);
  });
});
