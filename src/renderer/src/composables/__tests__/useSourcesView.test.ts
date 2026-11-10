import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';

// Store i UI są mockowane (composable jest rdzeniem logiki widoku; nie chcemy
// tu okablowania IPC). Stan trzymamy reaktywny, żeby `computed` aktualizowały się
// po mutacjach w testach.
const h = vi.hoisted(() => ({
  store: null as unknown,
  ui: null as unknown,
  player: null as unknown,
  confirm: null as unknown as { showConfirm: ReturnType<typeof vi.fn> }
}));

vi.mock('@renderer/stores/sources', async () => {
  const { reactive } = await import('vue');
  const store = reactive({
    isLoaded: true,
    sources: [] as unknown[],
    activeSourceId: null as string | null,
    activeEndpointId: null as string | null,
    activeSource: null as unknown,
    activeEndpoint: null as unknown,
    loading: false,
    items: [] as unknown[],
    tableRows: [] as unknown[],
    tableLoading: false,
    checking: {} as Record<string, boolean>,
    testStatus: {} as Record<string, { success: boolean }>,
    lastError: '',
    paginationMode: 'none',
    currentPage: 1,
    context: null as unknown,
    downloadedIds: new Set<string>(),
    reorderSources: vi.fn(async () => ({ ok: true })),
    setActive: vi.fn(),
    deleteSource: vi.fn(async () => ({ ok: true })),
    fetchItems: vi.fn(async () => {}),
    setPage: vi.fn(async () => {}),
    fetchMore: vi.fn(async () => {}),
    openItem: vi.fn(async () => {}),
    openTableRow: vi.fn(async () => {}),
    enqueueDownload: vi.fn(async () => ({ ok: true })),
    enqueueAll: vi.fn(async () => ({ queued: 1, failed: 0 })),
    unmarkDownloaded: vi.fn(async () => true),
    loadSources: vi.fn(async () => {}),
    testSource: vi.fn(async () => {})
  });
  h.store = store;
  return { useSourcesStore: () => store };
});

vi.mock('@renderer/stores/ui', () => {
  const ui = { notify: vi.fn() };
  h.ui = ui;
  return { useUIStore: () => ui };
});

vi.mock('@renderer/stores/player', () => {
  const player = { setTrack: vi.fn(), enrichTrack: vi.fn(), addToQueueMultiple: vi.fn() };
  h.player = player;
  return { usePlayerStore: () => player };
});

vi.mock('@renderer/composables/usePromptDialog', () => {
  const prompt = { showConfirm: vi.fn(async () => true) };
  h.confirm = prompt;
  return { usePromptDialog: () => prompt };
});

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const { useSourcesView } = await import('../useSourcesView');

type Store = {
  [key: string]: any;
  activeSourceId: string | null;
  activeEndpointId: string | null;
  activeSource: unknown;
  activeEndpoint: unknown;
  loading?: boolean;
  items: Array<{ id: string; title: string; subtitle?: string; type: string; mediaUrl?: string }>;
  tableRows: Array<{ id: string; title: string; type: string }>;
  checking: Record<string, boolean>;
  testStatus: Record<string, { success: boolean }>;
  lastError: string;
  setActive: ReturnType<typeof vi.fn>;
  fetchItems: ReturnType<typeof vi.fn>;
  reorderSources: ReturnType<typeof vi.fn>;
};

const store = h.store as unknown as Store;
const uiMock = h.ui as { notify: ReturnType<typeof vi.fn> };

function run() {
  let api: ReturnType<typeof useSourcesView> | undefined;
  const Comp = defineComponent({
    setup() {
      api = useSourcesView();
      return () => null;
    }
  });
  createApp(Comp).mount(document.createElement('div'));
  return api!;
}

beforeEach(() => {
  store.activeSourceId = null;
  store.activeEndpointId = null;
  store.activeSource = null;
  store.activeEndpoint = null;
  store.loading = false;
  store.items = [];
  store.tableRows = [];
  store.checking = {};
  store.testStatus = {};
  store.lastError = '';
  store.setActive.mockClear();
  store.reorderSources.mockClear();
  h.confirm.showConfirm.mockClear();
  h.confirm.showConfirm.mockResolvedValue(true);
});

describe('useSourcesView — viewMode', () => {
  it('defaults to cards without an endpoint', () => {
    expect(run().viewMode.value).toBe('cards');
  });

  it('uses endpoint.view for the list level', () => {
    store.activeEndpoint = { type: 'list', view: 'gallery' };
    expect(run().viewMode.value).toBe('gallery');
    store.activeEndpoint = { type: 'list' };
    expect(run().viewMode.value).toBe('cards');
  });

  it('maps a page table view, treating the plain table as cards', () => {
    store.activeEndpoint = { type: 'page', table: { view: 'carousel' } };
    expect(run().viewMode.value).toBe('carousel');
    store.activeEndpoint = { type: 'page', table: { view: 'table' } };
    expect(run().viewMode.value).toBe('cards');
    store.activeEndpoint = { type: 'page' };
    expect(run().viewMode.value).toBe('cards');
  });
});

describe('useSourcesView — healthState', () => {
  it('is unknown without an active source or a status', () => {
    expect(run().healthState.value).toBe('unknown');
    store.activeSourceId = 's1';
    expect(run().healthState.value).toBe('unknown');
  });

  it('reports checking, ok and fail', () => {
    store.activeSourceId = 's1';
    store.checking = { s1: true };
    expect(run().healthState.value).toBe('checking');
    store.checking = {};
    store.testStatus = { s1: { success: true } };
    expect(run().healthState.value).toBe('ok');
    store.testStatus = { s1: { success: false } };
    expect(run().healthState.value).toBe('fail');
  });
});

describe('useSourcesView — derived flags', () => {
  it('derives isPage, tableClickable and downloadable from the endpoint', () => {
    store.activeEndpoint = {
      type: 'page',
      table: { childId: 'c1' },
      mapping: { fields: { playerUrl: 'u' } }
    };
    const api = run();
    expect(api.isPage.value).toBe(true);
    expect(api.tableClickable.value).toBe(true);
    expect(api.downloadable.value).toBe(true);

    store.activeEndpoint = { type: 'list', mapping: { fields: {} } };
    expect(api.isPage.value).toBe(false);
    expect(api.tableClickable.value).toBe(false);
    expect(api.downloadable.value).toBe(false);
  });

  it('flags auth errors from the last error text', () => {
    store.lastError = 'HTTP 401 Unauthorized';
    expect(run().isAuthError.value).toBe(true);
    store.lastError = 'network down';
    expect(run().isAuthError.value).toBe(false);
  });
});

describe('useSourcesView — displayItems', () => {
  it('filters and sorts the store items', () => {
    store.items = [
      { id: '1', title: 'Beta', type: 'video' },
      { id: '2', title: 'Alpha', type: 'audio' },
      { id: '3', title: 'Gamma', type: 'video' }
    ];
    const api = run();
    api.filterText.value = 'al';
    expect(api.displayItems.value.map((i) => i.title)).toEqual(['Alpha']);
    api.filterText.value = '';
    api.sortMode.value = 'titleAsc';
    expect(api.displayItems.value.map((i) => i.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('useSourcesView — actions', () => {
  it('delegates reordering and endpoint switching', () => {
    store.activeSourceId = 's1';
    const api = run();
    api.onReorderSources(['b', 'a']);
    expect(store.reorderSources).toHaveBeenCalledWith(['b', 'a']);
    api.onEndpointChange('e2');
    expect(store.setActive).toHaveBeenCalledWith('s1', 'e2');
  });

  it('opens the add and edit editors', () => {
    const api = run();
    api.openAdd();
    expect(api.showEditor.value).toBe(true);
    expect(api.editingSource.value).toBeNull();
    api.openEdit({ id: 's1' } as never);
    expect(api.editingSource.value).toEqual({ id: 's1' });
  });

  it('does not fire a duplicate fetchItems from the watcher when navigation already started loading', async () => {
    const { nextTick } = await import('vue');
    store.activeSource = { id: 's1', name: 'S1' };
    store.activeSourceId = 's1';
    store.activeEndpointId = 'e1';
    run();
    await nextTick();
    store.fetchItems.mockClear();

    // Symuluje openItem/openTableRow/goBack: zmienia activeEndpointId i synchronicznie ustawia loading=true
    store.loading = true;
    store.activeEndpointId = 'e2';
    await nextTick();
    expect(store.fetchItems).not.toHaveBeenCalled();

    // Zwykłe przełączenie endpointu (setActive -> loading=false) wywołuje fetchItems
    store.loading = false;
    store.activeEndpointId = 'e3';
    await nextTick();
    expect(store.fetchItems).toHaveBeenCalled();
  });
});

describe('useSourcesView — streaming', () => {
  const player = () =>
    h.player as {
      setTrack: ReturnType<typeof vi.fn>;
      enrichTrack: ReturnType<typeof vi.fn>;
      addToQueueMultiple: ReturnType<typeof vi.fn>;
    };

  beforeEach(() => {
    store.activeSource = { id: 's1', name: 'S1' };
    player().setTrack.mockClear();
    player().enrichTrack.mockClear();
    player().addToQueueMultiple.mockClear();
  });

  it('plays a direct media item now', () => {
    const api = run();
    api.onPlayNow({ id: 'i1', title: 'Ep', type: 'video', mediaUrl: 'https://c/1.mp4' } as never);
    expect(player().setTrack).toHaveBeenCalledTimes(1);
    expect(player().setTrack.mock.calls[0][0]).toMatchObject({
      path: 'https://c/1.mp4',
      type: 'stream'
    });
  });

  it('queues only streamable items', () => {
    const api = run();
    api.onAddToQueue({
      id: 'i1',
      title: 'Ep',
      type: 'video',
      mediaUrl: 'https://c/1.mp4'
    } as never);
    expect(player().addToQueueMultiple).toHaveBeenCalledTimes(1);
    api.onAddToQueue({ id: 'i2', title: 'No media', type: 'video' } as never);
    expect(player().addToQueueMultiple).toHaveBeenCalledTimes(1);
  });

  it('does nothing without an active source or playable url', () => {
    store.activeSource = null;
    const api = run();
    api.onPlayNow({ id: 'i1', title: 'Ep', type: 'video', mediaUrl: 'https://c/1.mp4' } as never);
    expect(player().setTrack).not.toHaveBeenCalled();
  });
});

describe('useSourcesView — multi-select', () => {
  beforeEach(() => {
    store.items = [
      { id: 'a', title: 'A', type: 'video' },
      { id: 'b', title: 'B', type: 'video' },
      { id: 'c', title: 'C', type: 'video' }
    ];
  });

  it('toggles selection mode and clears the selection when disabled', () => {
    const api = run();
    api.toggleSelectMode();
    expect(api.selectMode.value).toBe(true);
    api.toggleSelect(store.items[0] as never);
    expect(api.selectedCount.value).toBe(1);
    api.toggleSelectMode();
    expect(api.selectMode.value).toBe(false);
    expect(api.selectedCount.value).toBe(0);
  });

  it('toggles a single item and selects a shift range', () => {
    const api = run();
    api.toggleSelect(store.items[0] as never);
    expect(api.selectedItems.value.map((i) => i.id)).toEqual(['a']);
    api.toggleSelect(store.items[2] as never, { shiftKey: true } as MouseEvent);
    expect(api.selectedItems.value.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    api.toggleSelect(store.items[1] as never);
    expect(api.selectedItems.value.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('ignores items without an id', () => {
    const api = run();
    api.toggleSelect({ title: 'no id', type: 'video' } as never);
    expect(api.selectedCount.value).toBe(0);
  });

  it('counts only playable selected items for queue/play', () => {
    store.items = [
      { id: 'v', title: 'V', type: 'video', mediaUrl: 'https://c/v.mp4' },
      { id: 'i', title: 'I', type: 'image', mediaUrl: 'https://c/i.jpg' }
    ];
    const api = run();
    api.toggleSelect(store.items[0] as never);
    api.toggleSelect(store.items[1] as never);
    expect(api.selectedCount.value).toBe(2);
    expect(api.selectedPlayableCount.value).toBe(1);
  });

  it('selects page table rows when the level is a page', () => {
    store.activeEndpoint = { type: 'page' };
    store.items = [{ id: 'page', title: 'Series', type: 'video' }];
    store.tableRows = [
      { id: 'r1', title: 'Odc 1', type: 'file' },
      { id: 'r2', title: 'Odc 2', type: 'file' }
    ];
    const api = run();
    api.toggleSelect(store.tableRows[0] as never);
    expect(api.selectedItems.value.map((i: { id: string }) => i.id)).toEqual(['r1']);
  });
});

describe('useSourcesView — query builder', () => {
  it('derives param controls from the endpoint params', () => {
    store.activeEndpoint = { type: 'list', params: { rating: 'safe', page: '1' } };
    const api = run();
    expect(api.paramKeys.value).toEqual(['rating', 'page']);
    expect(api.paramDefaults.value).toEqual({ rating: 'safe', page: '1' });
    expect(api.builderValues.value).toEqual({});
  });
});

describe('useSourcesView — persistence and navigation', () => {
  it('removes a source after confirmation and reports failures', async () => {
    store.sources = [{ id: 's1', name: 'Source' }];
    store.deleteSource.mockResolvedValueOnce({ ok: true });
    const api = run();

    await api.onRemoveSource('s1');
    expect(store.deleteSource).toHaveBeenCalledWith('s1');

    store.deleteSource.mockResolvedValueOnce({ ok: false, error: 'locked' });
    await api.onRemoveSource('s1');
    expect(uiMock.notify).toHaveBeenLastCalledWith('error', 'sources.deleteFailed');
  });

  it('skips deletion when confirmation is declined', async () => {
    store.sources = [{ id: 's1', name: 'Source' }];
    store.deleteSource.mockClear();
    h.confirm.showConfirm.mockResolvedValueOnce(false);
    const api = run();

    await api.onRemoveSource('s1');

    expect(store.deleteSource).not.toHaveBeenCalled();
  });

  it('exports sources with success, failure and cancellation', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, canceled: false })
      .mockResolvedValueOnce({ success: false, canceled: true });
    (window as unknown as { api: unknown }).api = { invoke };
    const api = run();

    await api.onExport();
    expect(uiMock.notify).toHaveBeenLastCalledWith('success', 'sources.exportOk');

    await api.onExport();
    expect(uiMock.notify).toHaveBeenLastCalledWith('error', 'sources.toastFailed');

    const before = (uiMock.notify as ReturnType<typeof vi.fn>).mock.calls.length;
    await api.onExport();
    expect((uiMock.notify as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
  });

  it('imports sources and reloads the store', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true, count: 3 })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, canceled: true });
    (window as unknown as { api: unknown }).api = { invoke };
    const api = run();

    await api.onImport();
    expect(store.loadSources).toHaveBeenCalled();
    expect(uiMock.notify).toHaveBeenLastCalledWith('success', 'sources.importOk');

    await api.onImport();
    expect(uiMock.notify).toHaveBeenLastCalledWith('error', 'sources.toastFailed');

    const before = (uiMock.notify as ReturnType<typeof vi.fn>).mock.calls.length;
    await api.onImport();
    expect((uiMock.notify as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
  });

  it('selects and tests a source', () => {
    store.sources = [{ id: 's1', name: 'Source' }];
    const api = run();

    api.onSelectSource('s1');
    expect(store.setActive).toHaveBeenCalledWith('s1');
    expect(store.testSource).toHaveBeenCalledTimes(1);

    api.onSelectSource('missing');
    expect(store.testSource).toHaveBeenCalledTimes(1);
  });

  it('refreshes with the merged query and scrolls to top', async () => {
    const scrollTo = vi.fn();
    const api = run();
    api.scrollRef.value = { scrollTo } as never;
    api.queryText.value = 'a=1';
    api.builderValues.value = { b: '2', empty: '' };

    api.refresh();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(store.fetchItems).toHaveBeenCalledWith({ a: '1', b: '2' });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('clamps page input and navigates pages', async () => {
    const scrollTo = vi.fn();
    const api = run();
    api.scrollRef.value = { scrollTo } as never;
    store.currentPage = 2;

    api.pageInput.value = 0;
    api.goToPage();
    expect(api.pageInput.value).toBe(1);
    expect(store.setPage).toHaveBeenCalledWith(1);

    api.pagePrev();
    expect(store.setPage).toHaveBeenLastCalledWith(1);

    api.pageNext();
    expect(store.fetchMore).toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    expect(scrollTo).toHaveBeenCalled();
  });

  it('opens item previews or child levels and table rows', async () => {
    const api = run();
    store.activeEndpoint = { type: 'list' };
    api.onItemClick({ id: 'i1', title: 'Item', type: 'video' } as never);
    expect(api.previewItem.value).toMatchObject({ id: 'i1' });

    store.activeEndpoint = { type: 'list', childId: 'details' };
    store.openItem.mockClear();
    api.onItemClick({ id: 'i2', title: 'Item', type: 'video' } as never);
    expect(store.openItem).toHaveBeenCalled();

    api.onRowClick({ id: 'r1', title: 'Row', type: 'file' } as never);
    expect(store.openTableRow).toHaveBeenCalled();
  });

  it('switches endpoints', () => {
    store.activeSourceId = 's1';
    const api = run();
    api.onEndpointChange('ep2');
    expect(store.setActive).toHaveBeenCalledWith('s1', 'ep2');
  });

  it('opens the editor in add and edit modes', () => {
    const api = run();
    api.openAdd();
    expect(api.showEditor.value).toBe(true);
    expect(api.editingSource.value).toBeNull();

    const source = { id: 's1' } as never;
    api.openEdit(source);
    expect(api.editingSource.value).toEqual(source);
  });
});

describe('useSourcesView — derived URL', () => {
  it('resolves endpoint names from the active source', () => {
    store.activeSource = { endpoints: [{ id: 'e1', name: 'List' }] };
    const api = run();

    expect(api.endpointName('e1')).toBe('List');
    expect(api.endpointName('missing')).toBe('missing');
  });

  it('exposes active source and endpoint', () => {
    store.activeSource = { id: 's1' };
    store.activeEndpoint = { type: 'list' };
    const api = run();

    expect(api.activeSource.value).toMatchObject({ id: 's1' });
    expect(api.activeEndpoint.value).toMatchObject({ type: 'list' });
  });

  it('builds the URL from query, page and context', () => {
    store.activeSource = { id: 's1', baseUrl: 'https://api.example' };
    store.activeEndpoint = { id: 'e1', path: '/list' };
    store.paginationMode = 'page';
    store.currentPage = 3;
    store.context = { slug: 'a' };
    const api = run();
    api.queryText.value = 'q=x';
    api.builderValues.value = { extra: '1' };

    expect(api.currentUrl.value).toEqual(expect.any(String));
  });
});

describe('useSourcesView — watchers and lifecycle', () => {
  it('clears items when the active source disappears', async () => {
    run();
    store.activeSource = { id: 's1' };
    store.activeSourceId = 's1';
    await nextTick();
    expect(store.fetchItems).toHaveBeenCalled();

    store.activeSource = null;
    store.items = [{ id: 'stale', title: 'Old', type: 'file' }];
    store.activeSourceId = null;
    await nextTick();
    expect(store.items).toEqual([]);
  });

  it('skips a duplicate fetch while loading', async () => {
    run();
    store.activeSource = { id: 's1' };
    store.loading = true;
    store.fetchItems.mockClear();

    store.activeEndpointId = 'e2';
    await nextTick();
    expect(store.fetchItems).not.toHaveBeenCalled();
  });

  it('syncs the page input with the store', async () => {
    const api = run();
    store.currentPage = 5;
    await nextTick();
    expect(api.pageInput.value).toBe(5);
  });

  it('loads sources on mount when needed', async () => {
    store.isLoaded = false;
    store.loadSources.mockClear();
    run();
    await nextTick();
    expect(store.loadSources).toHaveBeenCalled();
    store.isLoaded = true;
  });

  it('clears the selection when the view unmounts', () => {
    store.activeSourceId = 's1';
    store.activeEndpointId = 'e1';
    let api: ReturnType<typeof useSourcesView> | undefined;
    const Comp = defineComponent({
      setup() {
        api = useSourcesView();
        return () => null;
      }
    });
    const app = createApp(Comp);
    app.mount(document.createElement('div'));
    app.unmount();

    expect(api!.sources.activeSourceId).toBe('');
    expect(api!.sources.activeEndpointId).toBe('');
  });
});
