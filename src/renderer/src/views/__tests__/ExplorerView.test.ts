import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, reactive, ref } from 'vue';
import ExplorerView from '../ExplorerView.vue';

const state = vi.hoisted(() => ({
  explorer: null as any,
  settings: null as any,
  fileClipboard: {} as any,
  library: {} as any,
  player: {} as any,
  ui: null as any,
  router: { push: vi.fn() },
  pinned: null as any,
  togglePin: vi.fn(),
  promptVisible: null as any,
  promptIsConfirm: null as any,
  promptMessage: null as any,
  promptValue: null as any,
  showPrompt: vi.fn(),
  showConfirm: vi.fn(),
  promptConfirm: vi.fn(),
  promptCancel: vi.fn(),
  actions: null as any,
  actionsOptions: null as any,
  contextMenu: null as any,
  contextMenuOptions: null as any,
  handleTabDrop: vi.fn(),
  reveal: vi.fn(),
  invoke: vi.fn(),
  grantMediaAccess: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('vue-router', () => ({ useRouter: () => state.router }));
vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => state.explorer }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/clipboard', () => ({ useClipboardStore: () => state.fileClipboard }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/utils/clone', () => ({ clonePlain: (value: unknown) => value }));
vi.mock('@renderer/utils/path', () => ({ joinPath: (a: string, b: string) => `${a}/${b}` }));
vi.mock('@renderer/utils/explorerTabDrop', () => ({ handleTabDrop: state.handleTabDrop }));
vi.mock('@renderer/components/explorer/ExplorerDuplicatesPanel.vue', () => ({
  __esModule: true,
  default: {
    name: 'explorer-duplicates',
    props: ['open'],
    emits: ['update:open', 'reveal'],
    template: '<div data-testid="duplicates" />'
  }
}));
vi.mock('@renderer/components/explorer/ExplorerPropertiesDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'explorer-properties',
    props: ['item'],
    emits: ['close', 'renamed'],
    template: '<div data-testid="properties" />'
  }
}));
vi.mock('@renderer/components/explorer/ExplorerDetailsPane.vue', () => ({
  __esModule: true,
  default: {
    name: 'explorer-details',
    props: ['item', 'selectedCount'],
    emits: ['close', 'properties'],
    template: '<div data-testid="details" />'
  }
}));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => ({
    showPrompt: state.showPrompt,
    showConfirm: state.showConfirm,
    promptVisible: state.promptVisible,
    promptIsConfirm: state.promptIsConfirm,
    promptMessage: state.promptMessage,
    promptValue: state.promptValue,
    promptConfirm: state.promptConfirm,
    promptCancel: state.promptCancel
  })
}));
vi.mock('@renderer/composables/useAlwaysOnTop', () => ({
  useAlwaysOnTop: () => ({ pinned: state.pinned, togglePin: state.togglePin })
}));
vi.mock('@renderer/composables/useViewSearch', () => ({ useViewSearch: vi.fn() }));
vi.mock('@renderer/composables/useExplorerActions', () => ({
  useExplorerActions: (options: unknown) => {
    state.actionsOptions = options;
    return state.actions;
  }
}));
vi.mock('@renderer/composables/useExplorerContextMenu', () => ({
  useExplorerContextMenu: (options: unknown) => {
    state.contextMenuOptions = options;
    return state.contextMenu;
  }
}));

const NavStub = defineComponent({
  props: ['overlay'],
  emits: ['close'],
  template: '<div data-testid="nav" />'
});
const ToolbarStub = defineComponent({
  emits: ['search'],
  template: '<div data-testid="toolbar" />'
});
const BreadcrumbStub = { template: '<div data-testid="breadcrumb" />' };
const ViewModeStub = { template: '<div data-testid="view-mode" />' };
const TabsStub = { template: '<div data-testid="tabs" />' };
const ContentStub = defineComponent({
  props: ['files'],
  emits: ['open', 'menu'],
  setup(_, { expose }) {
    expose({ reveal: state.reveal });
    return () => h('div', { 'data-testid': 'content' });
  }
});
const PromptStub = defineComponent({
  props: ['value', 'visible', 'isConfirm', 'message'],
  emits: ['confirm', 'cancel'],
  template: '<div data-testid="prompt" />'
});

function file(overrides: Record<string, unknown> = {}) {
  return {
    name: 'file.mp3',
    path: 'C:/dir/file.mp3',
    extension: '.mp3',
    isDirectory: false,
    size: 1,
    ...overrides
  } as any;
}

let wrapper: VueWrapper | null = null;

async function flushAsync(): Promise<void> {
  await vi.dynamicImportSettled();
  await nextTick();
}

async function mountView() {
  wrapper = mount(ExplorerView, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ExplorerNavPane: NavStub,
        ExplorerToolbar: ToolbarStub,
        ExplorerBreadcrumb: BreadcrumbStub,
        ExplorerViewModeDropdown: ViewModeStub,
        ExplorerTabs: TabsStub,
        ExplorerContent: ContentStub,
        ExplorerPromptDialog: PromptStub
      }
    }
  });
  await flushAsync();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  state.pinned = ref(false);
  state.togglePin.mockReset();
  state.promptVisible = ref(false);
  state.promptIsConfirm = ref(false);
  state.promptMessage = ref('');
  state.promptValue = ref('');
  state.showPrompt = vi.fn().mockResolvedValue(null);
  state.showConfirm = vi.fn();
  state.promptConfirm.mockReset();
  state.promptCancel.mockReset();
  state.handleTabDrop.mockReset();
  state.reveal.mockReset();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(true);
  state.grantMediaAccess.mockReset();
  state.grantMediaAccess.mockResolvedValue(undefined);
  state.ui = { notify: vi.fn() };
  state.explorer = reactive({
    tabs: [{ id: 't1' }],
    currentPath: 'C:/dir',
    selectedCount: 0,
    selectedFiles: new Set<string>(),
    sortedFiles: [],
    addTab: vi.fn(),
    loadFiles: vi.fn().mockResolvedValue(undefined),
    navigateTo: vi.fn(),
    prevViewMode: vi.fn(),
    nextViewMode: vi.fn()
  });
  state.settings = reactive({
    explorer: { showHidden: false },
    updateExplorer: vi.fn()
  });
  state.actions = {
    playItem: vi.fn(),
    addToQueueItem: vi.fn(),
    copySelectedPaths: vi.fn(),
    cutSelectedPaths: vi.fn(),
    pasteClipboard: vi.fn(),
    renameItem: vi.fn(),
    deleteItem: vi.fn(),
    onKeydown: vi.fn()
  };
  state.contextMenu = {
    handleContextMenu: vi.fn(),
    handleEmptyContextMenu: vi.fn()
  };
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    grantMediaAccess: state.grantMediaAccess
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

function button(testId: string) {
  return wrapper!.get(`[data-testid="${testId}"]`);
}

describe('mount and navigation', () => {
  it('adds a tab only when none exist', async () => {
    await mountView();
    expect(state.explorer.addTab).not.toHaveBeenCalled();

    wrapper!.unmount();
    state.explorer.tabs = [];
    await mountView();
    expect(state.explorer.addTab).toHaveBeenCalledWith('C:/dir');

    wrapper!.unmount();
    state.explorer.currentPath = '';
    await mountView();
    expect(state.explorer.addTab).toHaveBeenLastCalledWith('');
  });

  it('toggles the navigation pane and closes it on narrow windows', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    await mountView();
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(true);
    expect(button('explorer-toggle-nav').attributes('aria-pressed')).toBe('true');

    await button('explorer-toggle-nav').trigger('click');
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(false);

    await button('explorer-toggle-nav').trigger('click');
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(true);
  });

  it('resets the nav preference when the window widens again', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    await mountView();
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(false);

    await button('explorer-toggle-nav').trigger('click');
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(true);
    expect(wrapper!.get('[data-testid="nav"]').classes()).toContain('absolute');

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1300 });
    window.dispatchEvent(new Event('resize'));
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(true);
    expect(wrapper!.get('[data-testid="nav"]').classes()).not.toContain('absolute');
  });

  it('closes the nav via its close event and stores the preference', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    await mountView();
    wrapper!.findComponent(NavStub).vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(false);
  });

  it('collapses the nav after navigating on a narrow window', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    await mountView();
    await button('explorer-toggle-nav').trigger('click');
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(true);

    state.explorer.currentPath = 'C:/other';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(false);
  });
});

describe('toolbar actions', () => {
  it('filters files by name and extension from the search event', async () => {
    state.explorer.sortedFiles = [
      file({ name: 'Song.MP3', extension: '.mp3' }),
      file({ name: 'clip.mkv', extension: '.mkv' })
    ];
    await mountView();
    expect(wrapper!.findComponent(ContentStub).props('files')).toHaveLength(2);

    wrapper!.findComponent(ToolbarStub).vm.$emit('search', '  SONG ');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(ContentStub).props('files')).toHaveLength(1);

    wrapper!.findComponent(ToolbarStub).vm.$emit('search', 'mkv');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(ContentStub).props('files')).toHaveLength(1);

    wrapper!.findComponent(ToolbarStub).vm.$emit('search', '');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(ContentStub).props('files')).toHaveLength(2);
  });

  it('toggles always-on-top and the duplicates panel', async () => {
    await mountView();
    await button('explorer-always-on-top').trigger('click');
    expect(state.togglePin).toHaveBeenCalled();

    await button('explorer-duplicates').trigger('click');
    await flushAsync();
    expect(wrapper!.findComponent({ name: 'explorer-duplicates' }).props('open')).toBe(true);
    await button('explorer-duplicates').trigger('click');
    await nextTick();
    expect(wrapper!.find('[data-testid="duplicates"]').exists()).toBe(false);
  });

  it('toggles hidden files and reloads the current folder', async () => {
    await mountView();
    await button('explorer-show-hidden').trigger('click');
    expect(state.settings.updateExplorer).toHaveBeenCalledWith({ showHidden: true });
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:/dir');
  });

  it('creates a folder after a non-empty prompt', async () => {
    state.showPrompt.mockResolvedValue('  New Folder  ');
    state.invoke.mockResolvedValue(true);
    await mountView();
    await button('explorer-new-folder').trigger('click');
    await Promise.resolve();

    expect(state.showPrompt).toHaveBeenCalledWith('explorer.newFolder');
    expect(state.invoke).toHaveBeenCalledWith('fs:mkdir', 'C:/dir/New Folder');
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:/dir');
  });

  it('skips folder creation for empty names or failed invokes', async () => {
    state.showPrompt.mockResolvedValue('   ');
    await mountView();
    await button('explorer-new-folder').trigger('click');
    await Promise.resolve();
    expect(state.invoke).not.toHaveBeenCalled();

    state.showPrompt.mockResolvedValue('Folder');
    state.invoke.mockResolvedValue(false);
    await button('explorer-new-folder').trigger('click');
    await Promise.resolve();
    expect(state.invoke).toHaveBeenCalledWith('fs:mkdir', 'C:/dir/Folder');
    expect(state.explorer.loadFiles).not.toHaveBeenCalled();
  });

  it('opens the current path in a new window', async () => {
    await mountView();
    await button('explorer-open-window').trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('explorer:create', 'C:/dir');

    state.explorer.currentPath = '';
    await button('explorer-open-window').trigger('click');
    expect(state.invoke).toHaveBeenLastCalledWith('explorer:create', undefined);
  });

  it('shows the selection counter only when something is selected', async () => {
    await mountView();
    expect(wrapper!.text()).not.toContain('explorer.nItems');

    state.explorer.selectedCount = 3;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('explorer.nItems');
  });
});

describe('details pane', () => {
  it('restores and persists the open state', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    await mountView();
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(true);

    await button('explorer-details-toggle').trigger('click');
    expect(localStorage.getItem('onda-explorer-details')).toBe('0');
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(false);
  });

  it('falls back to closed when storage reads throw', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await mountView();
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(false);
    getItem.mockRestore();
  });

  it('keeps working when storage writes throw', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await mountView();
    await button('explorer-details-toggle').trigger('click');
    await flushAsync();
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(true);
    setItem.mockRestore();
  });

  it('resolves the detail item only for a single selection', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    const item = file({ path: 'C:/dir/a.mp3' });
    state.explorer.sortedFiles = [item];
    state.explorer.selectedCount = 1;
    state.explorer.selectedFiles = new Set(['C:/dir/a.mp3']);
    await mountView();
    expect(wrapper!.findComponent({ name: 'explorer-details' }).props('item')).toEqual(item);

    state.explorer.selectedCount = 2;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent({ name: 'explorer-details' }).props('item')).toBeNull();
  });

  it('closes and forwards properties from the details pane', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    await mountView();
    wrapper!.findComponent({ name: 'explorer-details' }).vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(false);

    await button('explorer-details-toggle').trigger('click');
    await flushAsync();
    const item = file();
    wrapper!.findComponent({ name: 'explorer-details' }).vm.$emit('properties', item);
    await flushAsync();
    expect(wrapper!.findComponent({ name: 'explorer-properties' }).props('item')).toEqual(item);

    wrapper!.findComponent({ name: 'explorer-properties' }).vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="properties"]').exists()).toBe(false);
  });

  it('reloads files after the properties dialog renames an item', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    await mountView();
    wrapper!.findComponent({ name: 'explorer-details' }).vm.$emit('properties', file());
    await flushAsync();
    wrapper!.findComponent({ name: 'explorer-properties' }).vm.$emit('renamed');
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:/dir');
  });
});

describe('content interactions', () => {
  it('reveals duplicate files through the content ref', async () => {
    await mountView();
    await button('explorer-duplicates').trigger('click');
    await flushAsync();
    wrapper!.findComponent({ name: 'explorer-duplicates' }).vm.$emit('reveal', 'C:/dir/dup.mp3');
    expect(state.reveal).toHaveBeenCalledWith('C:/dir/dup.mp3');
  });

  it('plays on double click and routes context menus', async () => {
    const item = file();
    await mountView();
    wrapper!.findComponent(ContentStub).vm.$emit('open', item);
    expect(state.actions.playItem).toHaveBeenCalledWith(item);

    wrapper!.findComponent(ContentStub).vm.$emit('menu', new MouseEvent('contextmenu'), item);
    expect(state.contextMenu.handleContextMenu).toHaveBeenCalled();

    wrapper!.findComponent(ContentStub).vm.$emit('menu', new MouseEvent('contextmenu'), null);
    expect(state.contextMenu.handleEmptyContextMenu).toHaveBeenCalled();
  });

  it('opens the image viewer with only image files and a mapped index', async () => {
    const first = file({ name: 'a.png', path: 'C:/dir/a.png', extension: '.png' });
    const doc = file({ name: 'note.txt', path: 'C:/dir/note.txt', extension: '.txt' });
    const second = file({ name: 'b.jpg', path: 'C:/dir/b.jpg', extension: '.jpg' });
    state.explorer.sortedFiles = [first, doc, second];
    await mountView();

    await state.actionsOptions.openImageViewer(0);
    expect(state.grantMediaAccess).toHaveBeenCalledWith('C:/dir');
    expect(state.invoke).toHaveBeenCalledWith('imageViewer:open', [first, second], 0);

    state.invoke.mockClear();
    await state.actionsOptions.openImageViewer(2);
    expect(state.invoke).toHaveBeenCalledWith('imageViewer:open', [first, second], 1);

    state.invoke.mockClear();
    await state.actionsOptions.openImageViewer(1);
    expect(state.invoke).toHaveBeenCalledWith('imageViewer:open', [first, second], 0);
  });

  it('skips media access when there is no current path', async () => {
    state.explorer.currentPath = '';
    await mountView();
    await state.actionsOptions.openImageViewer(0);
    expect(state.grantMediaAccess).not.toHaveBeenCalled();
  });

  it('opens properties and forwards the context menu helpers', async () => {
    await mountView();
    const item = file();
    state.actionsOptions.openProperties(item);
    const options = state.contextMenuOptions;
    expect(options.playItem).toBe(state.actions.playItem);
    expect(options.addToQueueItem).toBe(state.actions.addToQueueItem);
    expect(options.renameItem).toBe(state.actions.renameItem);
    expect(options.deleteItem).toBe(state.actions.deleteItem);
    expect(options.createNewFolder).toBeTypeOf('function');

    options.navigateTo('C:/other');
    expect(state.explorer.navigateTo).toHaveBeenCalledWith('C:/other');
  });

  it('notifies when the tool window cannot be opened', async () => {
    await mountView();
    state.invoke.mockResolvedValueOnce(null);
    await state.contextMenuOptions.openToolWithFiles('ffmpeg', ['C:/a.mp4']);
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'app.error', 'tools.openFailed');

    state.invoke.mockRejectedValueOnce(new Error('boom'));
    await state.contextMenuOptions.openToolWithFiles('ffmpeg', []);
    expect(state.ui.notify).toHaveBeenLastCalledWith('error', 'app.error', 'boom');

    state.invoke.mockRejectedValueOnce('string error');
    await state.contextMenuOptions.openToolWithFiles('ffmpeg', []);
    expect(state.ui.notify).toHaveBeenLastCalledWith('error', 'app.error', 'string error');
  });

  it('changes the view mode on ctrl+wheel only', async () => {
    await mountView();
    const wheel = new WheelEvent('wheel', { ctrlKey: true, deltaY: -1, cancelable: true });
    window.dispatchEvent(wheel);
    expect(state.explorer.prevViewMode).toHaveBeenCalled();
    expect(wheel.defaultPrevented).toBe(true);

    window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 1, cancelable: true }));
    expect(state.explorer.nextViewMode).toHaveBeenCalled();

    window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: false, deltaY: -1, cancelable: true }));
    expect(state.explorer.prevViewMode).toHaveBeenCalledTimes(1);
  });

  it('forwards window tab drops', async () => {
    await mountView();
    await wrapper!.get('[data-testid="explorer-view"]').trigger('drop', {
      dataTransfer: { getData: () => 'payload' }
    });
    expect(state.handleTabDrop).toHaveBeenCalledWith('payload');

    await wrapper!.get('[data-testid="explorer-view"]').trigger('drop', {
      dataTransfer: { getData: () => '' }
    });
    expect(state.handleTabDrop).toHaveBeenLastCalledWith('');
  });
});

describe('window listeners', () => {
  it('wires keydown and removes every listener on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const view = await mountView();

    expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    expect(addSpy).toHaveBeenCalledWith('keydown', state.actions.onKeydown);
    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(state.actions.onKeydown).toHaveBeenCalled();

    view.unmount();
    wrapper = null;
    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', state.actions.onKeydown);
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});

describe('ExplorerView edge branches', () => {
  it('returns no detail item when the selected file vanished', async () => {
    state.explorer.selectedCount = 1;
    state.explorer.selectedFiles = new Set(['C:/missing.bin']);
    await mountView();
    const vm = wrapper!.vm as unknown as { detailItem: unknown };

    expect(vm.detailItem).toBeNull();
  });

  it('filters files without an extension', async () => {
    state.explorer.sortedFiles = [{ name: 'readme', path: 'C:/readme' }];
    await mountView();
    const vm = wrapper!.vm as unknown as { searchQuery: string; filteredFiles: unknown[] };

    vm.searchQuery = 'readme';
    await wrapper!.vm.$nextTick();

    expect(vm.filteredFiles).toHaveLength(1);

    vm.searchQuery = 'zzz';
    await wrapper!.vm.$nextTick();

    expect(vm.filteredFiles).toHaveLength(0);
  });

  it('reports a failed tool window launch', async () => {
    state.invoke.mockResolvedValue(null);
    await mountView();
    const vm = wrapper!.vm as unknown as {
      openToolWithFiles: (toolId: string, paths: string[]) => Promise<void>;
    };

    await vm.openToolWithFiles('converter', ['C:/a.mp3']);

    expect(state.ui.notify).toHaveBeenCalledWith('error', 'app.error', 'tools.openFailed');
  });

  it('renders active pin and hidden-file toggles', async () => {
    state.pinned.value = true;
    state.settings.explorer.showHidden = true;
    await mountView();

    expect(wrapper!.find('[data-testid="explorer-always-on-top"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="explorer-show-hidden"]').exists()).toBe(true);
  });

  it('positions the details pane over a narrow window', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    await mountView();

    expect(wrapper!.findComponent({ name: 'explorer-details' }).exists()).toBe(true);
  });
});

describe('ExplorerView wide details pane', () => {
  it('docks the details pane without overlay classes on a wide window', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    await mountView();

    const details = wrapper!.findComponent({ name: 'explorer-details' });
    expect(details.exists()).toBe(true);
    expect(details.classes()).not.toContain('absolute');
  });
});

describe('ExplorerView drag and dialog wiring', () => {
  it('forwards a tab drop from the window shell', async () => {
    await mountView();
    const root = wrapper!.get('[data-testid="explorer-view"]');

    await root.trigger('dragover');
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => 'tab-7' } });
    root.element.dispatchEvent(drop);
    await wrapper!.vm.$nextTick();

    expect(drop.defaultPrevented).toBe(true);
    expect(state.handleTabDrop).toHaveBeenCalledWith('tab-7');
  });

  it('accepts drag events over the content column without forwarding them', async () => {
    await mountView();
    const column = wrapper!.findAll('div').find((node) => node.classes().includes('min-w-0'))!;

    await column.trigger('dragover');
    await column.trigger('drop');

    // Wewnętrzna kolumna tylko blokuje domyślną akcję; zdarzenie nadal
    // bąbelkuje do shella okna, który przekazuje pusty payload dalej.
    expect(state.handleTabDrop).toHaveBeenCalledWith('');
  });
  it('binds the duplicates panel and the prompt dialog', async () => {
    await mountView();
    await button('explorer-duplicates').trigger('click');
    await flushAsync();
    const duplicates = wrapper!.findComponent({ name: 'explorer-duplicates' });
    const prompt = wrapper!.findComponent(PromptStub);

    prompt.vm.$emit('update:value', 'typed');
    await wrapper!.vm.$nextTick();

    expect(duplicates.props('open')).toBe(true);
    expect(prompt.props('value')).toBe('typed');
  });
});
