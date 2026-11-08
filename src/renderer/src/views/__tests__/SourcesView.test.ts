import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import SourcesView from '../SourcesView.vue';

const state = vi.hoisted(() => ({
  view: null as any,
  settings: null as any,
  invoke: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useSourcesView', () => ({ useSourcesView: () => state.view }));
vi.mock('@renderer/components/sources/SourceGuideModal.vue', () => ({
  __esModule: true,
  default: {
    name: 'guide-modal',
    emits: ['close'],
    template: '<div data-testid="guide-modal" />'
  }
}));
vi.mock('@renderer/components/sources/SourceEditorDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'editor-dialog',
    props: ['source'],
    emits: ['close', 'saved'],
    template: '<div data-testid="editor-dialog" />'
  }
}));
vi.mock('@renderer/components/sources/SourceDetailModal.vue', () => ({
  __esModule: true,
  default: {
    name: 'detail-modal',
    props: ['item', 'downloadable', 'downloaded'],
    emits: ['close', 'download', 'unmark', 'play', 'queue'],
    template: '<div data-testid="detail-modal" />'
  }
}));

const SidebarStub = defineComponent({
  props: ['sources', 'activeSourceId', 'testStatus', 'checking'],
  emits: ['select', 'add', 'edit', 'remove', 'reorder', 'export-all', 'import-all', 'guide'],
  template: '<div data-testid="sidebar" />'
});
const ContentStub = defineComponent({
  props: [
    'error',
    'isAuthError',
    'isPage',
    'viewMode',
    'pageItem',
    'rows',
    'rowLoading',
    'rowClickable',
    'downloadable',
    'items',
    'displayItems',
    'loading',
    'filterText',
    'hasMore',
    'paginationMode',
    'downloadingItem',
    'downloadedIds',
    'selectable',
    'selectedIds'
  ],
  emits: [
    'row-click',
    'download',
    'download-all',
    'preview',
    'select',
    'play',
    'fetch-more',
    'edit-source'
  ],
  template: '<div data-testid="content" />'
});
const FilterStub = defineComponent({
  props: ['filterText', 'sortMode'],
  emits: ['update:filterText', 'update:sortMode'],
  template: '<div data-testid="filter-bar" />'
});
const BulkStub = defineComponent({
  props: ['count', 'playableCount'],
  emits: ['download', 'queue', 'play', 'clear'],
  template: '<div data-testid="bulk-bar" />'
});
const BuilderStub = defineComponent({
  props: ['modelValue', 'keys', 'defaults'],
  emits: ['update:modelValue'],
  template: '<div data-testid="query-builder" />'
});
const ParamsStub = defineComponent({
  props: ['modelValue', 'open', 'requestUrl'],
  emits: ['update:modelValue', 'apply', 'close'],
  template: '<div data-testid="params-dialog" />'
});
const HealthStub = defineComponent({
  props: ['state', 'error', 'at', 'ms', 'itemCount', 'downloadedCount'],
  template: '<div data-testid="health-bar" />'
});
const EmptyStub = defineComponent({
  props: ['title', 'icon'],
  template: '<div data-testid="empty"><slot /></div>'
});
const IconStub = defineComponent({
  props: ['icon', 'label', 'disabled', 'pressed'],
  template:
    '<button :data-label="label" :disabled="disabled" :data-pressed="pressed"><slot /></button>'
});
const PromptStub = defineComponent({
  props: ['visible', 'isConfirm', 'message', 'value'],
  emits: ['update:value', 'confirm', 'cancel'],
  template: '<div data-testid="prompt" />'
});

let wrapper: VueWrapper | null = null;

function promptDialog() {
  return {
    promptVisible: ref(false),
    promptIsConfirm: ref(true),
    promptMessage: ref('message'),
    promptValue: ref(''),
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
}

function endpoint(id: string, name = id) {
  return { id, name } as any;
}

function task(id: string) {
  return { id, name: `item-${id}` } as any;
}

function mountView() {
  wrapper = mount(SourcesView, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SourcesSidebar: SidebarStub,
        SourcesContent: ContentStub,
        SourcesFilterBar: FilterStub,
        SourcesBulkBar: BulkStub,
        SourcesQueryBuilder: BuilderStub,
        SourcesQueryParamsDialog: ParamsStub,
        SourceHealthBar: HealthStub,
        EmptyState: EmptyStub,
        IconButton: IconStub,
        ExplorerPromptDialog: PromptStub
      }
    }
  });
  return wrapper;
}

function buttonByLabel(label: string) {
  return wrapper!.findAll('button').find((b) => b.attributes('data-label') === label);
}

beforeEach(() => {
  state.settings = reactive({
    appearance: { previewAdblock: true },
    updateAppearance: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(state.settings.appearance, patch)
    )
  });
  state.view = {
    sources: reactive({
      sources: [{ id: 's1', name: 'Source', endpoints: [endpoint('e1', 'One')] }],
      activeSourceId: 's1',
      testStatus: { s1: { error: 'e', at: 1, ms: 2 } },
      checking: false,
      loading: false,
      navStack: [],
      activeEndpointId: 'e1',
      paginationMode: 'none',
      currentPage: 2,
      startPage: 1,
      hasMore: true,
      items: [task('a')],
      tableRows: [],
      tableLoading: false,
      lastError: '',
      downloadedIds: new Set(['a']),
      goBack: vi.fn().mockResolvedValue(undefined),
      goBackTo: vi.fn().mockResolvedValue(undefined),
      fetchMore: vi.fn()
    }),
    prompt: promptDialog(),
    showEditor: ref(false),
    showGuide: ref(false),
    editingSource: ref(null),
    previewItem: ref(null),
    downloadingItem: ref(null),
    queryText: ref(''),
    pageInput: ref(2),
    scrollRef: ref(null),
    sortMode: ref('name'),
    filterText: ref(''),
    downloadingAll: ref(false),
    selectMode: ref(false),
    selectedIds: ref(new Set<string>()),
    selectedCount: ref(0),
    selectedPlayableCount: ref(0),
    viewMode: ref('grid'),
    paramKeys: ref([]),
    paramDefaults: ref({}),
    builderValues: ref({}),
    healthState: ref('ok'),
    displayItems: [task('a')],
    activeSource: ref({
      id: 's1',
      name: 'Source',
      endpoints: [endpoint('e1', 'One'), endpoint('e2', 'Two')]
    }),
    activeEndpoint: ref(endpoint('e1', 'One')),
    isPage: ref(false),
    tableClickable: ref(false),
    downloadable: ref(true),
    currentUrl: ref('https://api.example.com/list'),
    isAuthError: ref(false),
    endpointName: vi.fn((id: string) => `endpoint:${id}`),
    scrollToTop: vi.fn(),
    openAdd: vi.fn(),
    openEdit: vi.fn(),
    refresh: vi.fn(),
    goToPage: vi.fn(),
    pagePrev: vi.fn(),
    pageNext: vi.fn(),
    onEndpointChange: vi.fn(),
    onItemClick: vi.fn(),
    onRowClick: vi.fn(),
    onPlayNow: vi.fn(),
    onAddToQueue: vi.fn(),
    toggleSelectMode: vi.fn(),
    toggleSelect: vi.fn(),
    clearSelection: vi.fn(),
    onBulkDownload: vi.fn(),
    onBulkQueue: vi.fn(),
    onBulkPlay: vi.fn(),
    onDownload: vi.fn(),
    onDownloadAll: vi.fn(),
    onUnmarkDownloaded: vi.fn(),
    onSelectSource: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onRemoveSource: vi.fn(),
    onReorderSources: vi.fn()
  };
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('sidebar and empty state', () => {
  it('passes sidebar state and forwards actions', () => {
    mountView();
    const sidebar = wrapper!.findComponent(SidebarStub);
    expect(sidebar.props()).toMatchObject({
      sources: state.view.sources.sources,
      activeSourceId: 's1',
      checking: false
    });
    sidebar.vm.$emit('select', 's2');
    sidebar.vm.$emit('add');
    sidebar.vm.$emit('edit', state.view.sources.sources[0]);
    sidebar.vm.$emit('remove', 's1');
    sidebar.vm.$emit('reorder', ['s2', 's1']);
    sidebar.vm.$emit('export-all');
    sidebar.vm.$emit('import-all');
    sidebar.vm.$emit('guide');

    expect(state.view.onSelectSource).toHaveBeenCalledWith('s2');
    expect(state.view.openAdd).toHaveBeenCalled();
    expect(state.view.openEdit).toHaveBeenCalled();
    expect(state.view.onRemoveSource).toHaveBeenCalledWith('s1');
    expect(state.view.onReorderSources).toHaveBeenCalledWith(['s2', 's1']);
    expect(state.view.onExport).toHaveBeenCalled();
    expect(state.view.onImport).toHaveBeenCalled();
    expect(state.view.showGuide.value).toBe(true);
  });

  it('shows the empty state without an active source', () => {
    state.view.activeSource.value = null;
    mountView();
    expect(wrapper!.find('[data-testid="sources-detail"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="empty"]').exists()).toBe(true);

    wrapper!.get('[data-testid="sources-empty-add"]').trigger('click');
    expect(state.view.openAdd).toHaveBeenCalled();
  });
});

describe('toolbar navigation', () => {
  it('shows endpoint selection at the root and forwards changes', async () => {
    mountView();
    const select = wrapper!.get('select');
    expect(select.findAll('option').map((o) => o.text())).toEqual(['One', 'Two']);
    expect((select.element as HTMLSelectElement).value).toBe('e1');
    await select.setValue('e2');
    expect(state.view.onEndpointChange).toHaveBeenCalledWith('e2');
  });

  it('shows breadcrumbs and a back button inside nested navigation', async () => {
    state.view.sources.navStack = [
      { endpointId: 'e0', context: {} },
      { endpointId: 'e1', context: {} }
    ];
    mountView();
    expect(wrapper!.find('select').exists()).toBe(false);
    expect(wrapper!.text()).toContain('endpoint:e0');
    expect(wrapper!.text()).toContain('endpoint:e1');
    expect(wrapper!.text()).toContain('One');

    await buttonByLabel('sources.back')!.trigger('click');
    expect(state.view.sources.goBack).toHaveBeenCalled();
    expect(state.view.scrollToTop).toHaveBeenCalled();

    const crumbs = wrapper!.findAll('nav, div').filter((el) => el.text() === 'endpoint:e0');
    void crumbs;
    const crumb = wrapper!.findAll('button').find((b) => b.text() === 'endpoint:e0')!;
    await crumb.trigger('click');
    expect(state.view.sources.goBackTo).toHaveBeenCalledWith(0);
  });

  it('disables navigation while loading', async () => {
    state.view.sources.navStack = [{ endpointId: 'e0', context: {} }];
    state.view.sources.loading = true;
    mountView();
    expect(buttonByLabel('sources.back')!.attributes('disabled')).toBeDefined();
  });
});

describe('query params and pagination', () => {
  it('opens parameter dialog and displays the query summary', async () => {
    state.view.queryText.value = 'a=1\n\nb=2\n';
    mountView();
    const trigger = wrapper!.get('[data-testid="sources-query-params"]');
    expect(trigger.text()).toContain('a=1');
    expect(trigger.text()).toContain('2');

    await trigger.trigger('click');
    const dialog = wrapper!.findComponent(ParamsStub);
    expect(dialog.props()).toMatchObject({
      open: true,
      modelValue: 'a=1\n\nb=2\n',
      requestUrl: 'https://api.example.com/list'
    });
    dialog.vm.$emit('update:modelValue', 'x=3');
    dialog.vm.$emit('apply');
    expect(state.view.queryText.value).toBe('x=3');
    expect(state.view.refresh).toHaveBeenCalled();
    dialog.vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(dialog.props('open')).toBe(false);
  });

  it('shows the placeholder without query text', () => {
    mountView();
    expect(wrapper!.get('[data-testid="sources-query-params"]').text()).toContain(
      'sources.queryParams'
    );
  });

  it('renders pagination controls and forwards actions', async () => {
    state.view.sources.paginationMode = 'page';
    mountView();
    expect(buttonByLabel('sources.prevPage')!.attributes('disabled')).toBeUndefined();
    expect(buttonByLabel('sources.nextPage')!.attributes('disabled')).toBeUndefined();

    await buttonByLabel('sources.prevPage')!.trigger('click');
    expect(state.view.pagePrev).toHaveBeenCalled();
    await buttonByLabel('sources.nextPage')!.trigger('click');
    expect(state.view.pageNext).toHaveBeenCalled();

    const input = wrapper!.get('input[type="number"]');
    expect((input.element as HTMLInputElement).value).toBe('2');
    await input.setValue('4');
    expect(state.view.pageInput.value).toBe(4);
    await input.trigger('change');
    expect(state.view.goToPage).toHaveBeenCalled();
  });

  it('disables pagination edges while loading', () => {
    state.view.sources.paginationMode = 'page';
    state.view.sources.currentPage = 1;
    state.view.sources.startPage = 1;
    state.view.sources.hasMore = false;
    state.view.sources.loading = true;
    mountView();
    expect(buttonByLabel('sources.prevPage')!.attributes('disabled')).toBeDefined();
    expect(buttonByLabel('sources.nextPage')!.attributes('disabled')).toBeDefined();
  });
});

describe('toolbar actions', () => {
  it('downloads all items when available', async () => {
    mountView();
    const download = buttonByLabel('sources.downloadAll')!;
    expect(download.attributes('disabled')).toBeUndefined();
    await download.trigger('click');
    expect(state.view.onDownloadAll).toHaveBeenCalledWith(state.view.displayItems);
  });

  it('hides download-all for pages, empty lists and non-downloadable sources', () => {
    state.view.isPage.value = true;
    mountView();
    expect(buttonByLabel('sources.downloadAll')).toBeUndefined();

    state.view.isPage.value = false;
    state.view.sources.items = [];
    wrapper!.unmount();
    mountView();
    expect(buttonByLabel('sources.downloadAll')).toBeUndefined();

    state.view.sources.items = [task('a')];
    state.view.downloadable.value = false;
    wrapper!.unmount();
    mountView();
    expect(buttonByLabel('sources.downloadAll')).toBeUndefined();
  });

  it('shows a spinner while downloading all', () => {
    state.view.downloadingAll.value = true;
    mountView();
    expect(buttonByLabel('sources.downloadAll')!.attributes('disabled')).toBeDefined();
  });

  it('toggles selection mode when rows exist', async () => {
    mountView();
    const toggle = wrapper!.get('[data-testid="sources-select-toggle"]');
    expect(toggle.attributes('data-pressed')).toBe('false');
    await toggle.trigger('click');
    expect(state.view.toggleSelectMode).toHaveBeenCalled();

    state.view.selectMode.value = true;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[data-testid="sources-select-toggle"]').attributes('data-pressed')).toBe(
      'true'
    );
  });

  it('uses table rows for page selection visibility', () => {
    state.view.isPage.value = true;
    state.view.sources.items = [];
    state.view.sources.tableRows = [task('r')];
    mountView();
    expect(wrapper!.find('[data-testid="sources-select-toggle"]').exists()).toBe(true);
  });

  it('sets the adblock preference on mount and toggles it', async () => {
    mountView();
    expect(state.invoke).toHaveBeenCalledWith('preview:setAdblock', true);

    await wrapper!.get('[data-testid="sources-adblock-toggle"]').trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ previewAdblock: false });
    expect(state.invoke).toHaveBeenLastCalledWith('preview:setAdblock', false);

    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[data-testid="sources-adblock-toggle"]').attributes('data-pressed')).toBe(
      'false'
    );
  });

  it('refreshes and shows the loading state', async () => {
    mountView();
    await buttonByLabel('sources.refresh')!.trigger('click');
    expect(state.view.refresh).toHaveBeenCalled();

    state.view.sources.loading = true;
    await wrapper!.vm.$nextTick();
    expect(buttonByLabel('sources.refresh')!.attributes('disabled')).toBeDefined();
  });
});

describe('panels and content', () => {
  it('passes health-bar metrics', () => {
    mountView();
    expect(wrapper!.findComponent(HealthStub).props()).toMatchObject({
      state: state.view.healthState.value,
      error: 'e',
      at: 1,
      ms: 2,
      itemCount: 1,
      downloadedCount: 1
    });
  });

  it('shows filters and builder only outside page mode', async () => {
    mountView();
    expect(wrapper!.findComponent(FilterStub).props()).toMatchObject({
      filterText: '',
      sortMode: 'name'
    });

    state.view.paramKeys.value = ['q'];
    state.view.paramDefaults.value = { q: 'x' };
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(BuilderStub).props()).toMatchObject({
      keys: ['q'],
      defaults: { q: 'x' }
    });

    state.view.isPage.value = true;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="filter-bar"]').exists()).toBe(false);
  });

  it('shows the bulk bar and forwards actions', async () => {
    state.view.selectMode.value = true;
    state.view.selectedCount.value = 2;
    state.view.selectedPlayableCount.value = 1;
    mountView();
    const bulk = wrapper!.findComponent(BulkStub);
    expect(bulk.props()).toMatchObject({ count: 2, playableCount: 1 });

    bulk.vm.$emit('download');
    bulk.vm.$emit('queue');
    bulk.vm.$emit('play');
    bulk.vm.$emit('clear');
    expect(state.view.onBulkDownload).toHaveBeenCalled();
    expect(state.view.onBulkQueue).toHaveBeenCalled();
    expect(state.view.onBulkPlay).toHaveBeenCalled();
    expect(state.view.clearSelection).toHaveBeenCalled();
  });

  it('renders request details when available', () => {
    mountView();
    expect(wrapper!.text()).toContain('sources.requestDetails');
    expect(wrapper!.text()).toContain('https://api.example.com/list');
  });

  it('passes content state and forwards content events', () => {
    mountView();
    const content = wrapper!.findComponent(ContentStub);
    expect(content.props()).toMatchObject({
      isPage: false,
      viewMode: 'grid',
      downloadable: true,
      selectable: false
    });

    content.vm.$emit('row-click', task('r'));
    content.vm.$emit('download', task('a'));
    content.vm.$emit('download-all', state.view.displayItems);
    content.vm.$emit('preview', task('a'));
    content.vm.$emit('select', 'a', true);
    content.vm.$emit('play', task('a'));
    content.vm.$emit('fetch-more');
    content.vm.$emit('edit-source', state.view.activeSource.value);

    expect(state.view.onRowClick).toHaveBeenCalled();
    expect(state.view.onDownload).toHaveBeenCalled();
    expect(state.view.onDownloadAll).toHaveBeenCalled();
    expect(state.view.onItemClick).toHaveBeenCalled();
    expect(state.view.toggleSelect).toHaveBeenCalledWith('a', true);
    expect(state.view.onPlayNow).toHaveBeenCalled();
    expect(state.view.sources.fetchMore).toHaveBeenCalled();
    expect(state.view.openEdit).toHaveBeenCalledWith(state.view.activeSource.value);
  });
});

describe('dialogs', () => {
  it('opens editor and guide dialogs with forwarding', async () => {
    state.view.showEditor.value = true;
    state.view.editingSource.value = { id: 's1', name: 'Edited' };
    state.view.showGuide.value = true;
    mountView();
    await vi.dynamicImportSettled();
    await wrapper!.vm.$nextTick();

    const editor = wrapper!.findComponent({ name: 'editor-dialog' });
    expect(editor.props('source')).toMatchObject({ name: 'Edited' });
    editor.vm.$emit('saved');
    editor.vm.$emit('close');
    expect(state.view.refresh).toHaveBeenCalled();
    expect(state.view.showEditor.value).toBe(false);

    const guide = wrapper!.findComponent({ name: 'guide-modal' });
    guide.vm.$emit('close');
    expect(state.view.showGuide.value).toBe(false);
  });

  it('renders the preview modal and forwards actions', async () => {
    const item = task('a');
    state.view.previewItem.value = item;
    mountView();
    await vi.dynamicImportSettled();
    await wrapper!.vm.$nextTick();

    const detail = wrapper!.findComponent({ name: 'detail-modal' });
    expect(detail.props()).toMatchObject({ item, downloadable: true, downloaded: true });
    detail.vm.$emit('download');
    detail.vm.$emit('unmark');
    detail.vm.$emit('play');
    detail.vm.$emit('queue');
    expect(state.view.onDownload).toHaveBeenCalled();
    expect(state.view.onUnmarkDownloaded).toHaveBeenCalled();
    expect(state.view.onPlayNow).toHaveBeenCalled();
    expect(state.view.onAddToQueue).toHaveBeenCalled();
    detail.vm.$emit('close');
    expect(state.view.previewItem.value).toBeNull();
  });

  it('binds the prompt dialog', async () => {
    mountView();
    const prompt = wrapper!.findComponent(PromptStub);
    prompt.vm.$emit('update:value', 'typed');
    expect(state.view.prompt.promptValue.value).toBe('typed');
    prompt.vm.$emit('confirm');
    prompt.vm.$emit('cancel');
    expect(state.view.prompt.promptConfirm).toHaveBeenCalled();
    expect(state.view.prompt.promptCancel).toHaveBeenCalled();
  });
});
