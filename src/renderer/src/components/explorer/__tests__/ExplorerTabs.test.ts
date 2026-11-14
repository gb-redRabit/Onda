import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import ExplorerTabs from '../ExplorerTabs.vue';

// Karty Eksploratora: store, drag-drop i mostek są podstawione.
const state = vi.hoisted(() => ({
  explorer: null as any,
  settings: null as any,
  route: null as any,
  wid: 1,
  beginTabDrag: vi.fn(),
  claimTabDrag: vi.fn(),
  getActiveTabDrag: vi.fn(),
  clearTabDrag: vi.fn(),
  encodeTabPayload: vi.fn(() => 'payload'),
  parseTabPayload: vi.fn(),
  handleTabDrop: vi.fn(async () => false),
  getDroppedFilePaths: vi.fn((): string[] => []),
  getCachedWindowId: vi.fn(() => 1),
  getWindowId: vi.fn(async () => 1),
  invoke: vi.fn(),
  send: vi.fn(),
  confirm: vi.fn(async () => true),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-router', () => ({ useRoute: () => state.route }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@lucide/vue', () => ({
  FolderOpen: { render: () => null },
  Monitor: { render: () => null },
  X: { render: () => null },
  Plus: { render: () => null }
}));
vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => state.explorer }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/utils/tabDrag', () => ({
  beginTabDrag: state.beginTabDrag,
  claimTabDrag: state.claimTabDrag,
  getActiveTabDrag: state.getActiveTabDrag,
  clearTabDrag: state.clearTabDrag
}));
vi.mock('@renderer/utils/explorerTabDrop', () => ({
  encodeTabPayload: state.encodeTabPayload,
  parseTabPayload: state.parseTabPayload,
  handleTabDrop: state.handleTabDrop
}));
vi.mock('@renderer/utils/fileDrag', () => ({
  getDroppedFilePaths: state.getDroppedFilePaths
}));
vi.mock('@renderer/utils/windowId', () => ({
  getCachedWindowId: state.getCachedWindowId,
  getWindowId: state.getWindowId
}));

let wrapper: VueWrapper | null = null;

function tabs() {
  return [
    { id: 'a', path: 'C:\\one', label: 'One' },
    { id: 'b', path: 'C:\\two', label: '' }
  ];
}

function mountTabs(provideConfirm = true) {
  wrapper = mount(ExplorerTabs, {
    attachTo: document.body,
    global: {
      directives: { activate: {} },
      mocks: { $t: (key: string) => key },
      provide: provideConfirm ? { showConfirm: state.confirm } : {}
    }
  });
  return wrapper;
}

function tabButtons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('button')).filter(
    (button) => button.getAttribute('draggable') === 'true'
  ) as HTMLButtonElement[];
}

function dragEvent(init: Record<string, unknown> = {}): any {
  const data = new Map<string, string>();
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ctrlKey: false,
    metaKey: false,
    button: 0,
    dataTransfer: {
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
      getData: vi.fn((type: string) => data.get(type) ?? ''),
      effectAllowed: '',
      dropEffect: ''
    },
    ...init
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.explorer = reactive({
    tabs: tabs(),
    activeTabIndex: 0,
    currentPath: 'C:\\one',
    switchTab: vi.fn(),
    closeTab: vi.fn(),
    addTab: vi.fn(),
    navigateTo: vi.fn(),
    reorderTab: vi.fn(),
    loadFiles: vi.fn()
  });
  state.settings = reactive({ explorer: { confirmBeforeMove: false } });
  state.route = reactive({ name: 'main' });
  state.wid = 1;
  state.beginTabDrag.mockClear();
  state.claimTabDrag.mockClear();
  state.getActiveTabDrag.mockReset();
  state.getActiveTabDrag.mockReturnValue(null);
  state.clearTabDrag.mockClear();
  state.encodeTabPayload.mockClear();
  state.parseTabPayload.mockReset();
  state.parseTabPayload.mockReturnValue(null);
  state.handleTabDrop.mockReset();
  state.handleTabDrop.mockResolvedValue(false);
  state.getDroppedFilePaths.mockReset();
  state.getDroppedFilePaths.mockReturnValue([]);
  state.getCachedWindowId.mockClear();
  state.getWindowId.mockReset();
  state.getWindowId.mockResolvedValue(1);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.send.mockClear();
  state.confirm.mockReset();
  state.confirm.mockResolvedValue(true);
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke, send: state.send };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('rendering and clicks', () => {
  it('renders one button per tab with fallback label', () => {
    mountTabs();
    const buttons = tabButtons();
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('One');
    expect(buttons[1].textContent).toContain('explorer.thisComputer');
    expect(document.body.querySelectorAll('button').length).toBe(3); // + nowa karta
  });

  it('renders nothing without tabs', () => {
    state.explorer.tabs = [];
    mountTabs();
    expect(document.body.querySelector('button')).toBeNull();
  });

  it('renders computer tabs and adds a tab without a path', () => {
    state.explorer.tabs = [{ id: 'a', path: '', label: 'PC' }];
    state.explorer.currentPath = '';
    mountTabs();

    expect(tabButtons()[0].textContent).toContain('PC');
    document.body.querySelectorAll('button')[1].click();
    expect(state.explorer.addTab).toHaveBeenCalledWith('');
  });

  it('switches tabs and closes via the close icon', async () => {
    mountTabs();
    const buttons = tabButtons();
    buttons[0].click();
    expect(state.explorer.switchTab).toHaveBeenCalledWith(0);

    const closeIcon = buttons[1].querySelectorAll('span')[1] as HTMLElement;
    closeIcon.click();
    expect(state.explorer.closeTab).toHaveBeenCalledWith(1);
  });

  it('adds a tab from the current path', () => {
    mountTabs();
    document.body.querySelectorAll('button')[2].click();
    expect(state.explorer.addTab).toHaveBeenCalledWith('C:\\one');
  });

  it('closes on middle click and prevents default', () => {
    mountTabs();
    tabButtons()[0].dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(state.explorer.closeTab).toHaveBeenCalledWith(0);
  });

  it('prevents default on middle mousedown', () => {
    mountTabs();
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'button', { value: 1 });
    const notCanceled = tabButtons()[0].dispatchEvent(event);
    expect(notCanceled).toBe(false);
  });

  it('ignores primary-button aux and mousedown events', () => {
    mountTabs();
    const button = tabButtons()[0];
    const aux = new MouseEvent('auxclick', { bubbles: true, cancelable: true });
    Object.defineProperty(aux, 'button', { value: 0 });
    button.dispatchEvent(aux);
    expect(state.explorer.closeTab).not.toHaveBeenCalled();

    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(down, 'button', { value: 0 });
    expect(button.dispatchEvent(down)).toBe(true);
  });
});

describe('tab drag', () => {
  it('starts dragging with payload and effect', () => {
    mountTabs();
    const event = dragEvent();
    tabButtons()[0].dispatchEvent(
      Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer: event.dataTransfer })
    );
    expect(state.beginTabDrag).toHaveBeenCalledWith('C:\\one');
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'payload');
    expect(event.dataTransfer.effectAllowed).toBe('move');
  });

  it('creates a new window when the drag leaves unclaimed', () => {
    state.getActiveTabDrag.mockReturnValue({ path: 'C:\\one', claimed: false });
    state.explorer.tabs = [
      { id: 'a', path: 'C:\\one', label: 'One' },
      { id: 'b', path: 'C:\\two', label: 'Two' }
    ];
    mountTabs();
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[0].dispatchEvent(new Event('dragend', { bubbles: true }));

    vi.advanceTimersByTime(200);

    expect(state.invoke).toHaveBeenCalledWith('explorer:create', 'C:\\one');
    expect(state.explorer.closeTab).toHaveBeenCalledWith(0);
    expect(state.clearTabDrag).toHaveBeenCalled();
  });

  it('clears the drag without creating when claimed', () => {
    state.getActiveTabDrag.mockReturnValue({ path: 'C:\\one', claimed: true });
    mountTabs();
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[0].dispatchEvent(new Event('dragend', { bubbles: true }));

    vi.advanceTimersByTime(200);
    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.clearTabDrag).toHaveBeenCalled();
  });

  it('removes the last tab by closing the explorer window or navigating home', () => {
    state.explorer.tabs = [{ id: 'a', path: 'C:\\one', label: 'One' }];
    state.route.name = 'explorer-window';
    mountTabs();
    state.getActiveTabDrag.mockReturnValue({ path: 'C:\\one', claimed: false });
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[0].dispatchEvent(new Event('dragend', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(state.invoke).toHaveBeenCalledWith('window:close');

    state.invoke.mockClear();
    state.route.name = 'main';
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[0].dispatchEvent(new Event('dragend', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(state.explorer.navigateTo).toHaveBeenCalledWith('');
  });

  it('highlights a drop target and schedules a hover switch', async () => {
    state.explorer.activeTabIndex = 0;
    mountTabs();
    const event = dragEvent();
    tabButtons()[1].dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true }), {
        dataTransfer: event.dataTransfer,
        ctrlKey: true
      })
    );
    await nextTick();

    expect(event.dataTransfer.dropEffect).toBe('copy');
    expect(tabButtons()[1].className).toContain('ring-2');

    vi.advanceTimersByTime(600);
    expect(state.explorer.switchTab).toHaveBeenCalledWith(1);
  });

  it('tracks dragenter/leave and clears the target', async () => {
    mountTabs();
    tabButtons()[1].dispatchEvent(new Event('dragenter', { bubbles: true }));
    await nextTick();
    expect(tabButtons()[1].className).toContain('ring-2');
    tabButtons()[1].dispatchEvent(new Event('dragleave', { bubbles: true }));
    await nextTick();
    expect(tabButtons()[1].className).not.toContain('ring-2');
  });

  it('keeps the target while nested drag enters remain', async () => {
    mountTabs();
    tabButtons()[1].dispatchEvent(new Event('dragenter', { bubbles: true }));
    tabButtons()[1].dispatchEvent(new Event('dragenter', { bubbles: true }));
    tabButtons()[1].dispatchEvent(new Event('dragleave', { bubbles: true }));
    await nextTick();
    expect(tabButtons()[1].className).toContain('ring-2');
    tabButtons()[1].dispatchEvent(new Event('dragleave', { bubbles: true }));
    await nextTick();
    expect(tabButtons()[1].className).not.toContain('ring-2');
  });

  it('clears a pending hover switch on dragend and drop', async () => {
    mountTabs();
    tabButtons()[1].dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true }), {
        dataTransfer: dragEvent().dataTransfer
      })
    );
    vi.advanceTimersByTime(300);
    tabButtons()[0].dispatchEvent(new Event('dragend', { bubbles: true }));
    vi.advanceTimersByTime(600);
    expect(state.explorer.switchTab).not.toHaveBeenCalled();

    tabButtons()[1].dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true }), {
        dataTransfer: dragEvent().dataTransfer
      })
    );
    tabButtons()[1].dispatchEvent(new Event('drop', { bubbles: true }));
    await vi.waitFor(() => expect(state.handleTabDrop).toHaveBeenCalled());
    vi.advanceTimersByTime(600);
    expect(state.explorer.switchTab).not.toHaveBeenCalled();
  });

  it('ignores hover switching and leave bookkeeping during its own drag', async () => {
    mountTabs();
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[1].dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true }), {
        dataTransfer: dragEvent().dataTransfer
      })
    );
    tabButtons()[1].dispatchEvent(new Event('dragenter', { bubbles: true }));
    tabButtons()[1].dispatchEvent(new Event('dragleave', { bubbles: true }));
    await nextTick();
    vi.advanceTimersByTime(600);

    expect(state.explorer.switchTab).not.toHaveBeenCalled();
    expect(tabButtons()[1].className).not.toContain('ring-2');
  });

  it('handles dragover without data and over the active tab', async () => {
    state.explorer.activeTabIndex = 0;
    mountTabs();
    tabButtons()[0].dispatchEvent(new Event('dragover', { bubbles: true }));
    vi.advanceTimersByTime(600);

    expect(state.explorer.switchTab).not.toHaveBeenCalled();
  });

  it('skips window creation when the drag disappears or the tab is gone', async () => {
    state.getActiveTabDrag.mockReturnValueOnce({ path: 'C:\\one', claimed: false });
    mountTabs();
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[0].dispatchEvent(new Event('dragend', { bubbles: true }));
    state.getActiveTabDrag.mockReturnValueOnce(null);
    vi.advanceTimersByTime(200);
    expect(state.invoke).not.toHaveBeenCalled();

    state.getActiveTabDrag.mockReturnValue({ path: 'C:\\missing', claimed: false });
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[0].dispatchEvent(new Event('dragend', { bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(state.invoke).toHaveBeenCalledWith('explorer:create', 'C:\\missing');
    expect(state.explorer.closeTab).not.toHaveBeenCalled();
  });
});

describe('drops', () => {
  it('reorders tabs dropped inside the same window', async () => {
    state.parseTabPayload.mockReturnValue({ wid: 1, path: 'C:\\one' });
    mountTabs();
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[1].dispatchEvent(new Event('drop', { bubbles: true }));
    await vi.waitFor(() => expect(state.claimTabDrag).toHaveBeenCalledWith('C:\\one'));
    expect(state.explorer.reorderTab).toHaveBeenCalledWith(0, 1);
  });

  it('delegates foreign tab drops to the shared handler', async () => {
    state.parseTabPayload.mockReturnValue({ wid: 2, path: 'C:\\other' });
    state.handleTabDrop.mockResolvedValue(true);
    mountTabs();
    tabButtons()[1].dispatchEvent(new Event('drop', { bubbles: true }));
    await vi.waitFor(() => expect(state.handleTabDrop).toHaveBeenCalled());
    expect(state.explorer.loadFiles).not.toHaveBeenCalled();
  });

  it('copies dropped files after confirmation', async () => {
    state.getDroppedFilePaths.mockReturnValue(['C:\\file.mp3']);
    state.settings.explorer.confirmBeforeMove = true;
    mountTabs();
    tabButtons()[1].dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true }), { ctrlKey: true })
    );

    await vi.waitFor(() => expect(state.confirm).toHaveBeenCalled());
    expect(state.t).toHaveBeenCalledWith('explorer.copyConfirm', {
      n: 1,
      dir: 'two'
    });
    await vi.waitFor(() => expect(state.invoke).toHaveBeenCalled());
    expect(state.invoke).toHaveBeenCalledWith('fs:copy', ['C:\\file.mp3'], 'C:\\two');
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:\\two');
    expect(state.explorer.switchTab).toHaveBeenCalledWith(1);
    expect(state.send).toHaveBeenCalledWith('explorer:refreshAll');
  });

  it('moves files and stops when confirmation is declined', async () => {
    state.getDroppedFilePaths.mockReturnValue(['C:\\file.mp3']);
    state.settings.explorer.confirmBeforeMove = true;
    state.confirm.mockResolvedValue(false);
    mountTabs();
    tabButtons()[1].dispatchEvent(new Event('drop', { bubbles: true }));

    await vi.waitFor(() => expect(state.confirm).toHaveBeenCalled());
    expect(state.invoke).not.toHaveBeenCalled();

    state.confirm.mockResolvedValue(true);
    tabButtons()[1].dispatchEvent(new Event('drop', { bubbles: true }));
    await vi.waitFor(() => expect(state.invoke).toHaveBeenCalled());
    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['C:\\file.mp3'], 'C:\\two');
  });

  it('ignores drops without paths', async () => {
    mountTabs();
    tabButtons()[1].dispatchEvent(new Event('drop', { bubbles: true }));
    await vi.waitFor(() => expect(state.handleTabDrop).toHaveBeenCalled());
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('claims a same-index drop without reordering', async () => {
    state.parseTabPayload.mockReturnValue({ wid: 1, path: 'C:\\one' });
    mountTabs();
    tabButtons()[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
    tabButtons()[0].dispatchEvent(new Event('drop', { bubbles: true }));
    await vi.waitFor(() => expect(state.claimTabDrag).toHaveBeenCalledWith('C:\\one'));
    expect(state.explorer.reorderTab).not.toHaveBeenCalled();
  });

  it('drops plain-text paths', async () => {
    mountTabs();
    const data = new Map([['text/plain', 'C:\\a\nC:\\b']]);
    const dataTransfer = {
      getData: (type: string) => data.get(type) ?? '',
      setData: vi.fn(),
      dropEffect: '',
      effectAllowed: ''
    };
    tabButtons()[1].dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true }), { dataTransfer })
    );

    await vi.waitFor(() =>
      expect(state.invoke).toHaveBeenCalledWith('fs:move', ['C:\\a', 'C:\\b'], 'C:\\two')
    );
  });

  it('falls back to the default confirm and empty dir label', async () => {
    state.explorer.tabs[1].path = '';
    state.settings.explorer.confirmBeforeMove = true;
    mountTabs(false);
    const data = new Map([['text/plain', 'C:\\a']]);
    const dataTransfer = {
      getData: (type: string) => data.get(type) ?? '',
      setData: vi.fn(),
      dropEffect: '',
      effectAllowed: ''
    };
    tabButtons()[1].dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true }), { dataTransfer })
    );

    await vi.waitFor(() => expect(state.invoke).toHaveBeenCalledWith('fs:move', ['C:\\a'], ''));
    expect(state.t).toHaveBeenCalledWith('explorer.moveConfirm', { n: 1, dir: '' });
  });
});
