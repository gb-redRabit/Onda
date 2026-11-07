import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, reactive, ref } from 'vue';
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
const DuplicatesStub = defineComponent({
  props: ['open'],
  emits: ['update:open', 'reveal'],
  template: '<div data-testid="duplicates" />'
});
const PromptStub = defineComponent({
  props: ['value', 'visible', 'isConfirm', 'message'],
  emits: ['confirm', 'cancel'],
  template: '<div data-testid="prompt" />'
});
const PropertiesStub = defineComponent({
  props: ['item'],
  emits: ['close', 'renamed'],
  template: '<div data-testid="properties" />'
});
const DetailsStub = defineComponent({
  props: ['item', 'selectedCount'],
  emits: ['close', 'properties'],
  template: '<div data-testid="details" />'
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

function mountView() {
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
        ExplorerDuplicatesPanel: DuplicatesStub,
        ExplorerPromptDialog: PromptStub,
        ExplorerPropertiesDialog: PropertiesStub,
        ExplorerDetailsPane: DetailsStub
      }
    }
  });
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
  it('adds a tab only when none exist', () => {
    mountView();
    expect(state.explorer.addTab).not.toHaveBeenCalled();

    wrapper!.unmount();
    state.explorer.tabs = [];
    mountView();
    expect(state.explorer.addTab).toHaveBeenCalledWith('C:/dir');

    wrapper!.unmount();
    state.explorer.currentPath = '';
    mountView();
    expect(state.explorer.addTab).toHaveBeenLastCalledWith('');
  });

  it('toggles the navigation pane and closes it on narrow windows', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    mountView();
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(true);
    expect(button('explorer-toggle-nav').attributes('aria-pressed')).toBe('true');

    await button('explorer-toggle-nav').trigger('click');
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(false);

    await button('explorer-toggle-nav').trigger('click');
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(true);
  });

  it('resets the nav preference when the window widens again', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    mountView();
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
    mountView();
    wrapper!.findComponent(NavStub).vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="nav"]').exists()).toBe(false);
  });

  it('collapses the nav after navigating on a narrow window', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    mountView();
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
    mountView();
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
    mountView();
    await button('explorer-always-on-top').trigger('click');
    expect(state.togglePin).toHaveBeenCalled();

    await button('explorer-duplicates').trigger('click');
    expect(wrapper!.findComponent(DuplicatesStub).props('open')).toBe(true);
    await button('explorer-duplicates').trigger('click');
    expect(wrapper!.findComponent(DuplicatesStub).props('open')).toBe(false);
  });

  it('toggles hidden files and reloads the current folder', async () => {
    mountView();
    await button('explorer-show-hidden').trigger('click');
    expect(state.settings.updateExplorer).toHaveBeenCalledWith({ showHidden: true });
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:/dir');
  });

  it('creates a folder after a non-empty prompt', async () => {
    state.showPrompt.mockResolvedValue('  New Folder  ');
    state.invoke.mockResolvedValue(true);
    mountView();
    await button('explorer-new-folder').trigger('click');
    await Promise.resolve();

    expect(state.showPrompt).toHaveBeenCalledWith('explorer.newFolder');
    expect(state.invoke).toHaveBeenCalledWith('fs:mkdir', 'C:/dir/New Folder');
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:/dir');
  });

  it('skips folder creation for empty names or failed invokes', async () => {
    state.showPrompt.mockResolvedValue('   ');
    mountView();
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
    mountView();
    await button('explorer-open-window').trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('explorer:create', 'C:/dir');

    state.explorer.currentPath = '';
    await button('explorer-open-window').trigger('click');
    expect(state.invoke).toHaveBeenLastCalledWith('explorer:create', undefined);
  });

  it('shows the selection counter only when something is selected', async () => {
    mountView();
    expect(wrapper!.text()).not.toContain('explorer.nItems');

    state.explorer.selectedCount = 3;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('explorer.nItems');
  });
});

describe('details pane', () => {
  it('restores and persists the open state', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    mountView();
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(true);

    await button('explorer-details-toggle').trigger('click');
    expect(localStorage.getItem('onda-explorer-details')).toBe('0');
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(false);
  });

  it('falls back to closed when storage reads throw', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    mountView();
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(false);
    getItem.mockRestore();
  });

  it('keeps working when storage writes throw', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    mountView();
    await button('explorer-details-toggle').trigger('click');
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(true);
    setItem.mockRestore();
  });

  it('resolves the detail item only for a single selection', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    const item = file({ path: 'C:/dir/a.mp3' });
    state.explorer.sortedFiles = [item];
    state.explorer.selectedCount = 1;
    state.explorer.selectedFiles = new Set(['C:/dir/a.mp3']);
    mountView();
    expect(wrapper!.findComponent(DetailsStub).props('item')).toEqual(item);

    state.explorer.selectedCount = 2;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(DetailsStub).props('item')).toBeNull();
  });

  it('closes and forwards properties from the details pane', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    mountView();
    wrapper!.findComponent(DetailsStub).vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="details"]').exists()).toBe(false);

    await button('explorer-details-toggle').trigger('click');
    const item = file();
    wrapper!.findComponent(DetailsStub).vm.$emit('properties', item);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(PropertiesStub).props('item')).toEqual(item);

    wrapper!.findComponent(PropertiesStub).vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="properties"]').exists()).toBe(false);
  });

  it('reloads files after the properties dialog renames an item', async () => {
    localStorage.setItem('onda-explorer-details', '1');
    mountView();
    wrapper!.findComponent(DetailsStub).vm.$emit('properties', file());
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(PropertiesStub).vm.$emit('renamed');
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:/dir');
  });
});

describe('content interactions', () => {
  it('reveals duplicate files through the content ref', async () => {
    mountView();
    wrapper!.findComponent(DuplicatesStub).vm.$emit('reveal', 'C:/dir/dup.mp3');
    expect(state.reveal).toHaveBeenCalledWith('C:/dir/dup.mp3');
  });

  it('plays on double click and routes context menus', async () => {
    const item = file();
    mountView();
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
    mountView();

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
    mountView();
    await state.actionsOptions.openImageViewer(0);
    expect(state.grantMediaAccess).not.toHaveBeenCalled();
  });

  it('opens properties and forwards the context menu helpers', () => {
    mountView();
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
    mountView();
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
    mountView();
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
    mountView();
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
  it('wires keydown and removes every listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const view = mountView();

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
