import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import { setActivePinia, createPinia } from 'pinia';

const h = vi.hoisted(() => ({
  list: null as any,
  items: null as any,
  navigation: null as any,
  test: null as any,
  downloads: null as any
}));

vi.mock('../sources/list', () => ({ createSourcesList: () => h.list }));
vi.mock('../sources/items', () => ({ createSourcesItems: vi.fn(() => h.items) }));
vi.mock('../sources/navigation', () => ({ createSourcesNavigation: vi.fn(() => h.navigation) }));
vi.mock('../sources/test', () => ({ createSourcesTest: () => h.test }));
vi.mock('../sources/downloads', () => ({ createSourcesDownloads: vi.fn(() => h.downloads) }));

import { useSourcesStore } from '../sources';
import { createSourcesItems } from '../sources/items';
import { createSourcesNavigation } from '../sources/navigation';
import { createSourcesDownloads } from '../sources/downloads';
import type { MediaSource } from '@renderer/types/sources';

const source = { id: 'src1', name: 'Source' } as MediaSource;

function buildModules() {
  h.list = {
    sources: ref([source]),
    activeSourceId: ref('src1'),
    activeEndpointId: ref(null),
    isLoaded: ref(true),
    activeSource: ref(source),
    activeEndpoint: ref(null),
    paginationMode: ref('pages'),
    startPage: ref(1),
    loadSources: vi.fn(),
    saveSource: vi.fn(async () => ({ ok: true, id: 'src1' })),
    deleteSource: vi.fn(async () => ({ ok: true, wasActive: false })),
    reorderSources: vi.fn()
  };
  h.items = {
    items: shallowRef([{ id: 'i1' }]),
    loading: ref(false),
    hasMore: ref(true),
    nextFrom: ref('next'),
    lastError: ref(''),
    currentPage: ref(1),
    context: ref(null),
    tableRows: shallowRef([]),
    tableLoading: ref(false),
    resetItems: vi.fn(),
    fetchItems: vi.fn(),
    fetchMore: vi.fn(),
    setPage: vi.fn()
  };
  h.navigation = {
    navStack: ref([]),
    setActive: vi.fn(),
    openItem: vi.fn(),
    openTableRow: vi.fn(),
    goBack: vi.fn(),
    goBackTo: vi.fn(),
    forgetSource: vi.fn(),
    resetNavigation: vi.fn()
  };
  h.test = {
    testStatus: ref({}),
    checking: ref(false),
    testSource: vi.fn(),
    tableRowsTest: vi.fn(),
    forgetSource: vi.fn()
  };
  h.downloads = {
    enqueueDownload: vi.fn(),
    enqueueAll: vi.fn(),
    downloadedIds: ref(new Set<string>()),
    loadDownloaded: vi.fn(),
    unmarkDownloaded: vi.fn()
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  buildModules();
  vi.clearAllMocks();
});

describe('composition', () => {
  it('wires all slices and passes their dependencies through', () => {
    const store = useSourcesStore();

    expect(createSourcesItems).toHaveBeenCalledWith({
      activeSource: h.list.activeSource,
      activeEndpoint: h.list.activeEndpoint,
      paginationMode: h.list.paginationMode,
      startPage: h.list.startPage
    });
    expect(createSourcesNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: h.list.sources,
        activeSourceId: h.list.activeSourceId,
        activeEndpointId: h.list.activeEndpointId,
        activeEndpoint: h.list.activeEndpoint,
        startPage: h.list.startPage,
        context: h.items.context,
        currentPage: h.items.currentPage,
        resetItems: h.items.resetItems,
        fetchItems: h.items.fetchItems
      })
    );
    expect(createSourcesDownloads).toHaveBeenCalledWith({ activeSource: h.list.activeSource });

    expect(store.sources).toEqual([source]);
    expect(store.activeSource).toEqual(source);
    expect(store.items).toEqual([{ id: 'i1' }]);
    expect(store.activeEndpointId).toBeNull();
    expect(store.isLoaded).toBe(true);
  });

  it('exposes slice actions directly', () => {
    const store = useSourcesStore();

    store.loadSources();
    store.fetchItems();
    store.fetchMore();
    store.setPage(3);
    store.reorderSources(['src1']);
    store.setActive('src1');
    store.openItem({ id: 'i1' } as never);
    store.openTableRow([] as never);
    store.goBack();
    store.goBackTo(0);
    store.testSource(source);
    store.enqueueDownload({ id: 'i1' } as never);

    expect(h.list.loadSources).toHaveBeenCalledTimes(1);
    expect(h.items.fetchItems).toHaveBeenCalledTimes(1);
    expect(h.items.fetchMore).toHaveBeenCalledTimes(1);
    expect(h.items.setPage).toHaveBeenCalledWith(3);
    expect(h.list.reorderSources).toHaveBeenCalledTimes(1);
    expect(h.navigation.setActive).toHaveBeenCalledWith('src1');
    expect(h.navigation.openItem).toHaveBeenCalledTimes(1);
    expect(h.navigation.openTableRow).toHaveBeenCalledTimes(1);
    expect(h.navigation.goBack).toHaveBeenCalledTimes(1);
    expect(h.navigation.goBackTo).toHaveBeenCalledWith(0);
    expect(h.test.testSource).toHaveBeenCalledWith(source);
    expect(h.downloads.enqueueDownload).toHaveBeenCalledTimes(1);
  });
});

describe('saveSource', () => {
  it('resets items and forgets navigation/test state on success', async () => {
    const store = useSourcesStore();

    await expect(store.saveSource(source)).resolves.toEqual({ ok: true, error: undefined });

    expect(h.list.saveSource).toHaveBeenCalledWith(source);
    expect(h.items.resetItems).toHaveBeenCalledTimes(1);
    expect(h.navigation.forgetSource).toHaveBeenCalledWith('src1');
    expect(h.test.forgetSource).toHaveBeenCalledWith('src1');
  });

  it('skips forgetting when the save returns no id', async () => {
    h.list.saveSource.mockResolvedValue({ ok: true });
    const store = useSourcesStore();

    await store.saveSource(source);

    expect(h.items.resetItems).toHaveBeenCalledTimes(1);
    expect(h.navigation.forgetSource).not.toHaveBeenCalled();
    expect(h.test.forgetSource).not.toHaveBeenCalled();
  });

  it('does not touch state on failure', async () => {
    h.list.saveSource.mockResolvedValue({ ok: false, error: 'invalid' });
    const store = useSourcesStore();

    await expect(store.saveSource(source)).resolves.toEqual({ ok: false, error: 'invalid' });

    expect(h.items.resetItems).not.toHaveBeenCalled();
    expect(h.navigation.forgetSource).not.toHaveBeenCalled();
  });
});

describe('deleteSource', () => {
  it('returns the error without touching state', async () => {
    h.list.deleteSource.mockResolvedValue({ ok: false, error: 'missing' });
    const store = useSourcesStore();

    await expect(store.deleteSource('src1')).resolves.toEqual({ ok: false, error: 'missing' });

    expect(h.navigation.forgetSource).not.toHaveBeenCalled();
    expect(h.navigation.resetNavigation).not.toHaveBeenCalled();
  });

  it('forgets the source without resetting when it was not active', async () => {
    const store = useSourcesStore();

    await expect(store.deleteSource('src1')).resolves.toEqual({ ok: true });

    expect(h.navigation.forgetSource).toHaveBeenCalledWith('src1');
    expect(h.test.forgetSource).toHaveBeenCalledWith('src1');
    expect(h.navigation.resetNavigation).not.toHaveBeenCalled();
    expect(h.items.resetItems).not.toHaveBeenCalled();
  });

  it('resets navigation and items when the active source is deleted', async () => {
    h.list.deleteSource.mockResolvedValue({ ok: true, wasActive: true });
    const store = useSourcesStore();

    await store.deleteSource('src1');

    expect(h.navigation.resetNavigation).toHaveBeenCalledTimes(1);
    expect(h.items.resetItems).toHaveBeenCalledTimes(1);
  });
});
