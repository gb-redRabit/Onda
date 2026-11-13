import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import AppMenu from '../AppMenu.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  player: null as any,
  ui: null as any,
  isMaximized: null as any,
  openDropdown: null as any,
  showViewActions: null as any,
  openFile: vi.fn(),
  openFolder: vi.fn(),
  toggleDropdown: vi.fn(),
  closeDropdown: vi.fn(),
  minimize: vi.fn(),
  maximize: vi.fn(),
  closeWin: vi.fn(),
  quitApp: vi.fn(),
  navigateAndClose: vi.fn(),
  navigateSettingsTab: vi.fn(),
  actionClose: vi.fn(),
  pipRestore: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/composables/useAppMenu', () => ({
  useAppMenu: () => ({
    isMaximized: state.isMaximized,
    openDropdown: state.openDropdown,
    showViewActions: state.showViewActions,
    openFile: state.openFile,
    openFolder: state.openFolder,
    toggleDropdown: state.toggleDropdown,
    closeDropdown: state.closeDropdown,
    minimize: state.minimize,
    maximize: state.maximize,
    closeWin: state.closeWin,
    quitApp: state.quitApp,
    navigateAndClose: state.navigateAndClose,
    navigateSettingsTab: state.navigateSettingsTab,
    actionClose: state.actionClose
  })
}));
vi.mock('@renderer/assets/icon.png', () => ({ default: 'icon.png' }));

function menuStub(name: string, props: string[] = [], emits: string[] = []) {
  return defineComponent({
    props,
    emits,
    template: `<div data-menu="${name}">
      <button role="menuitem" type="button">One</button>
      <button role="menuitem" type="button">Two</button>
      <button role="menuitem" type="button">Three</button>
    </div>`
  });
}

const FileStub = menuStub('file', [], ['open-file', 'open-folder', 'quit']);
const ViewStub = menuStub('view', ['shortcut'], ['navigate']);
const PlaybackStub = menuStub('playback', ['action'], ['restore-pip', 'close']);
const HelpStub = menuStub('help', [], ['about', 'shortcuts', 'dependencies', 'updates', 'logs']);
const WindowControlsStub = defineComponent({
  props: ['isMaximized'],
  emits: ['minimize', 'maximize', 'close'],
  template: '<div data-testid="window-controls" />'
});
const ViewActionsStub = defineComponent({
  props: ['show', 'shortcut'],
  emits: ['search'],
  template: '<div data-testid="view-actions" />'
});

let wrapper: VueWrapper | null = null;

function mountMenu() {
  wrapper = mount(AppMenu, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AppMenuFileDropdown: FileStub,
        AppMenuViewDropdown: ViewStub,
        AppMenuPlaybackDropdown: PlaybackStub,
        AppMenuHelpDropdown: HelpStub,
        AppMenuWindowControls: WindowControlsStub,
        AppMenuViewActions: ViewActionsStub
      }
    }
  });
  return wrapper;
}

function trigger(name: string) {
  return wrapper!.get(`[data-menu-trigger="${name}"]`);
}

function keydown(init: KeyboardEventInit, target: EventTarget = document) {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  state.settings = { shortcuts: { search: 'Ctrl+K' } };
  state.player = { currentTrack: { id: 'a' } };
  state.ui = { toggleGlobalSearch: vi.fn() };
  state.isMaximized = ref(false);
  state.openDropdown = ref<string | null>(null);
  state.showViewActions = ref(true);
  for (const fn of [
    state.openFile,
    state.openFolder,
    state.toggleDropdown,
    state.closeDropdown,
    state.minimize,
    state.maximize,
    state.closeWin,
    state.quitApp,
    state.navigateAndClose,
    state.navigateSettingsTab,
    state.actionClose,
    state.pipRestore
  ]) {
    fn.mockReset();
  }
  state.toggleDropdown.mockImplementation((name: string) => {
    state.openDropdown.value = state.openDropdown.value === name ? null : name;
  });
  (window as { api?: unknown }).api = { pipRestore: state.pipRestore };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('renders the brand, menu triggers and window controls', () => {
    mountMenu();
    expect(wrapper!.get('img').attributes('src')).toBe('icon.png');
    expect(wrapper!.text()).toContain('Onda');
    expect(trigger('file').text()).toBe('menu.file');
    expect(trigger('view').text()).toBe('menu.view');
    expect(trigger('playback').text()).toBe('menu.playback');
    expect(trigger('help').text()).toBe('menu.help');
    expect(wrapper!.find('[data-testid="window-controls"]').exists()).toBe(true);
  });

  it('hides the playback menu without a current track', () => {
    state.player.currentTrack = null;
    mountMenu();
    expect(wrapper!.find('[data-menu-trigger="playback"]').exists()).toBe(false);
  });

  it('marks the open trigger and exposes aria state', async () => {
    mountMenu();
    await trigger('file').trigger('click');
    expect(state.toggleDropdown).toHaveBeenCalledWith('file');
    expect(trigger('file').attributes('aria-expanded')).toBe('true');
    expect(trigger('file').classes()).toContain('bg-primary/12');
    expect(wrapper!.find('[data-menu="file"]').exists()).toBe(true);

    await trigger('file').trigger('click');
    expect(trigger('file').attributes('aria-expanded')).toBe('false');
  });

  it('switches menus on hover only when one is already open', async () => {
    mountMenu();
    await trigger('view').trigger('mouseenter');
    expect(state.openDropdown.value).toBeNull();

    state.openDropdown.value = 'file';
    await trigger('view').trigger('mouseenter');
    expect(state.openDropdown.value).toBe('view');
    expect(wrapper!.find('[data-menu="view"]').exists()).toBe(true);
  });

  it('passes shortcuts and view action state to children', () => {
    mountMenu();
    state.openDropdown.value = 'view';
    return wrapper!.vm.$nextTick().then(() => {
      const view = wrapper!.findComponent(ViewStub as any) as any;
      expect(view.props('shortcut')).toBeTypeOf('function');
      expect(view.props('shortcut')('search')).toBe('Ctrl+K');
      expect(view.props('shortcut')('missing')).toBe('');

      const actions = wrapper!.findComponent(ViewActionsStub);
      expect(actions.props()).toMatchObject({ show: true, shortcut: 'Ctrl+K' });
      actions.vm.$emit('search');
      expect(state.ui.toggleGlobalSearch).toHaveBeenCalled();
    });
  });

  it('uses an empty shortcut when settings omit the key', () => {
    state.settings.shortcuts = {};
    mountMenu();
    expect(wrapper!.findComponent(ViewActionsStub).props('shortcut')).toBe('');
  });
});

describe('menu events', () => {
  it('forwards file actions and closes the dropdown', async () => {
    mountMenu();
    state.openDropdown.value = 'file';
    await wrapper!.vm.$nextTick();

    const menu = wrapper!.findComponent(FileStub);
    menu.vm.$emit('open-file');
    menu.vm.$emit('open-folder');
    menu.vm.$emit('quit');
    expect(state.openFile).toHaveBeenCalled();
    expect(state.openFolder).toHaveBeenCalled();
    expect(state.quitApp).toHaveBeenCalled();
    expect(state.closeDropdown).toHaveBeenCalledTimes(3);
  });

  it('forwards view navigation', async () => {
    mountMenu();
    state.openDropdown.value = 'view';
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(ViewStub).vm.$emit('navigate', '/library');
    expect(state.navigateAndClose).toHaveBeenCalledWith('/library');
    expect(state.closeDropdown).toHaveBeenCalled();
  });

  it('forwards help destinations', async () => {
    mountMenu();
    state.openDropdown.value = 'help';
    await wrapper!.vm.$nextTick();
    const menu = wrapper!.findComponent(HelpStub);
    menu.vm.$emit('about');
    menu.vm.$emit('shortcuts');
    menu.vm.$emit('dependencies');
    menu.vm.$emit('updates');
    menu.vm.$emit('logs');
    expect(state.navigateSettingsTab.mock.calls.map((call) => call[0])).toEqual([
      'about',
      'shortcuts',
      'dependencies',
      'updates',
      'system-logs'
    ]);
  });

  it('forwards playback actions and restores PiP', async () => {
    mountMenu();
    state.openDropdown.value = 'playback';
    await wrapper!.vm.$nextTick();
    const menu = wrapper!.findComponent(PlaybackStub);
    expect((menu as any).props('action')).toBe(state.actionClose);
    menu.vm.$emit('close');
    expect(state.closeDropdown).toHaveBeenCalled();

    menu.vm.$emit('restore-pip');
    expect(state.pipRestore).toHaveBeenCalled();
    expect(state.closeDropdown).toHaveBeenCalledTimes(2);
  });

  it('forwards window controls', () => {
    mountMenu();
    const controls = wrapper!.findComponent(WindowControlsStub);
    expect(controls.props('isMaximized')).toBe(false);
    controls.vm.$emit('minimize');
    controls.vm.$emit('maximize');
    controls.vm.$emit('close');
    expect(state.minimize).toHaveBeenCalled();
    expect(state.maximize).toHaveBeenCalled();
    expect(state.closeWin).toHaveBeenCalled();
  });
});

describe('keyboard navigation', () => {
  it('opens a menu with ArrowDown and focuses the first item', async () => {
    mountMenu();
    const event = keydown({ key: 'ArrowDown' }, trigger('file').element);
    expect(event.defaultPrevented).toBe(true);
    await wrapper!.vm.$nextTick();
    expect(state.openDropdown.value).toBe('file');
    const items = wrapper!.findAll('[data-menu="file"] [role="menuitem"]');
    expect(document.activeElement).toBe(items[0].element);
  });

  it('moves focus with ArrowDown, ArrowUp, Home and End', async () => {
    mountMenu();
    state.openDropdown.value = 'file';
    await wrapper!.vm.$nextTick();
    const items = wrapper!.findAll('[data-menu="file"] [role="menuitem"]');
    (items[0].element as HTMLElement).focus();

    keydown({ key: 'ArrowDown' }, items[0].element);
    expect(document.activeElement).toBe(items[1].element);
    keydown({ key: 'ArrowUp' }, items[1].element);
    expect(document.activeElement).toBe(items[0].element);
    keydown({ key: 'ArrowUp' }, items[0].element);
    expect(document.activeElement).toBe(items[2].element);
    keydown({ key: 'Home' }, items[2].element);
    expect(document.activeElement).toBe(items[0].element);
    keydown({ key: 'End' }, items[0].element);
    expect(document.activeElement).toBe(items[2].element);
  });

  it('ignores navigation keys from outside the open menu', async () => {
    mountMenu();
    state.openDropdown.value = 'file';
    await wrapper!.vm.$nextTick();
    const before = document.activeElement;
    keydown({ key: 'ArrowDown' }, wrapper!.get('[data-menu-trigger="view"]').element);
    expect(document.activeElement).toBe(before);
  });

  it('ignores unrelated keys and closed menus', async () => {
    mountMenu();
    const closed = keydown({ key: 'ArrowDown' });
    expect(closed.defaultPrevented).toBe(false);

    state.openDropdown.value = 'file';
    await wrapper!.vm.$nextTick();
    const event = keydown({ key: 'a' }, document.body);
    expect(event.defaultPrevented).toBe(false);
    expect(state.openDropdown.value).toBe('file');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    mountMenu();
    state.openDropdown.value = 'file';
    await wrapper!.vm.$nextTick();
    const event = keydown({ key: 'Escape' });
    expect(event.defaultPrevented).toBe(true);
    expect(state.openDropdown.value).toBeNull();
    expect(document.activeElement).toBe(trigger('file').element);
  });

  it('closes on Tab without restoring focus', async () => {
    mountMenu();
    state.openDropdown.value = 'help';
    await wrapper!.vm.$nextTick();
    const triggerEl = trigger('help').element;
    (triggerEl as HTMLElement).focus();
    const event = keydown({ key: 'Tab' });
    expect(event.defaultPrevented).toBe(false);
    expect(state.openDropdown.value).toBeNull();
    expect(document.activeElement).toBe(triggerEl);
  });

  it('cycles to the previous and next menu with ArrowLeft/Right', async () => {
    mountMenu();
    state.openDropdown.value = 'file';
    await wrapper!.vm.$nextTick();

    const right = keydown({ key: 'ArrowRight' });
    expect(right.defaultPrevented).toBe(true);
    await wrapper!.vm.$nextTick();
    expect(state.openDropdown.value).toBe('view');

    keydown({ key: 'ArrowLeft' });
    await wrapper!.vm.$nextTick();
    expect(state.openDropdown.value).toBe('file');

    state.openDropdown.value = 'help';
    await wrapper!.vm.$nextTick();
    keydown({ key: 'ArrowRight' });
    await wrapper!.vm.$nextTick();
    expect(state.openDropdown.value).toBe('file');

    state.openDropdown.value = 'file';
    await wrapper!.vm.$nextTick();
    keydown({ key: 'ArrowLeft' });
    await wrapper!.vm.$nextTick();
    expect(state.openDropdown.value).toBe('help');
  });

  it('ignores horizontal navigation when no trigger is active', async () => {
    mountMenu();
    state.openDropdown.value = 'unknown';
    await wrapper!.vm.$nextTick();
    const event = keydown({ key: 'ArrowRight' });
    expect(event.defaultPrevented).toBe(false);
  });

  it('removes the document listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    mountMenu();
    wrapper!.unmount();
    wrapper = null;
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('ignores horizontal navigation when the next trigger has no name', async () => {
    mountMenu();
    state.openDropdown.value = 'help';
    await wrapper!.vm.$nextTick();
    const bogus = document.createElement('div');
    bogus.dataset.menuTrigger = '';
    document.body.appendChild(bogus);
    try {
      const event = keydown({ key: 'ArrowRight' });
      expect(event.defaultPrevented).toBe(false);
    } finally {
      bogus.remove();
    }
  });

  it('ignores unknown keys pressed inside an open menu', async () => {
    mountMenu();
    state.openDropdown.value = 'file';
    await wrapper!.vm.$nextTick();
    const item = wrapper!.find('[data-menu="file"] [role="menuitem"]').element;
    const event = keydown({ key: 'a' }, item);
    expect(event.defaultPrevented).toBe(false);
  });

  it('opens every dropdown from its trigger', async () => {
    mountMenu();
    for (const name of ['view', 'playback', 'help']) {
      await trigger(name).trigger('click');
      expect(state.toggleDropdown).toHaveBeenLastCalledWith(name);
      expect(trigger(name).attributes('aria-expanded')).toBe('true');
    }
  });

  it('switches menus on hover for view, playback and help', async () => {
    mountMenu();
    state.openDropdown.value = 'file';
    for (const name of ['view', 'playback', 'help']) {
      await trigger(name).trigger('mouseenter');
      expect(state.openDropdown.value).toBe(name);
    }
  });

  it('switches back to file on hover when another menu is open', async () => {
    mountMenu();
    state.openDropdown.value = 'help';

    await trigger('file').trigger('mouseenter');

    expect(state.openDropdown.value).toBe('file');
  });

  it('opens dropdowns with the down arrow for every trigger', async () => {
    mountMenu();
    for (const name of ['view', 'playback', 'help']) {
      keydown({ key: 'ArrowDown' }, trigger(name).element);
      await wrapper!.vm.$nextTick();
      expect(state.openDropdown.value).toBe(name);
    }
  });

  it('restores PiP without the preload bridge', async () => {
    delete (window as { api?: unknown }).api;
    mountMenu();
    state.openDropdown.value = 'playback';
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(PlaybackStub).vm.$emit('restore-pip');
    expect(state.closeDropdown).toHaveBeenCalled();
  });
});
