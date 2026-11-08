import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useAppMenu } from '../useAppMenu';

const state = vi.hoisted(() => ({
  route: null as any,
  router: null as any,
  player: null as any,
  ui: null as any,
  openMediaFiles: vi.fn(),
  invoke: vi.fn(),
  onMaximized: null as any,
  offMaximized: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => state.router
}));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/composables/useOpenMedia', () => ({
  openMediaFiles: state.openMediaFiles
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));

let wrapper: VueWrapper | null = null;
let exposed: any;

function setup() {
  const Comp = defineComponent({
    setup() {
      exposed = useAppMenu();
      return () => h('div');
    }
  });
  wrapper = mount(Comp, { attachTo: document.body });
  return wrapper;
}

beforeEach(() => {
  state.route = reactive({ name: 'home' });
  state.router = { push: vi.fn() };
  state.player = {};
  state.ui = { toggleViewSearch: vi.fn() };
  state.openMediaFiles.mockReset();
  state.openMediaFiles.mockResolvedValue(undefined);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.onMaximized = null;
  state.offMaximized.mockReset();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    on: vi.fn((channel: string, callback: (value: unknown) => void) => {
      if (channel === 'window:maximized') state.onMaximized = callback;
      return state.offMaximized;
    })
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('dropdown state', () => {
  it('toggles and closes dropdowns', () => {
    setup();
    exposed.toggleDropdown('file');
    expect(exposed.openDropdown.value).toBe('file');
    exposed.toggleDropdown('file');
    expect(exposed.openDropdown.value).toBeNull();

    exposed.toggleDropdown('view');
    exposed.closeDropdown();
    expect(exposed.openDropdown.value).toBeNull();
  });

  it('closes when clicking outside the app menu', () => {
    setup();
    const menu = document.createElement('div');
    menu.setAttribute('data-app-menu', '');
    const inside = document.createElement('button');
    menu.appendChild(inside);
    document.body.appendChild(menu);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(exposed.openDropdown.value).toBeNull();

    exposed.toggleDropdown('file');
    inside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(exposed.openDropdown.value).toBe('file');

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(exposed.openDropdown.value).toBeNull();
  });
});

describe('opening files and folders', () => {
  it('opens selected media files', async () => {
    setup();
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:/a.mp3'] });
    await exposed.openFile();
    expect(state.invoke).toHaveBeenCalledWith('dialog:openFile');
    expect(state.openMediaFiles).toHaveBeenCalledWith(['C:/a.mp3'], state.router);
  });

  it('skips canceled, empty and missing results', async () => {
    setup();
    state.invoke.mockResolvedValueOnce({ canceled: true, filePaths: ['C:/a.mp3'] });
    await exposed.openFile();
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: [] });
    await exposed.openFile();
    state.invoke.mockResolvedValueOnce(undefined);
    await exposed.openFile();
    expect(state.openMediaFiles).not.toHaveBeenCalled();
  });

  it('opens folder files', async () => {
    setup();
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:/a.mp3', 'C:/b.mp4'] });
    await exposed.openFolder();
    expect(state.invoke).toHaveBeenCalledWith('dialog:openFolderFiles');
    expect(state.openMediaFiles).toHaveBeenCalledWith(['C:/a.mp3', 'C:/b.mp4'], state.router);

    state.invoke.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await exposed.openFolder();
    expect(state.openMediaFiles).toHaveBeenCalledTimes(1);
  });

  it('works without the preload bridge', async () => {
    setup();
    delete (window as { api?: unknown }).api;
    await expect(exposed.openFile()).resolves.toBeUndefined();
    await expect(exposed.openFolder()).resolves.toBeUndefined();
  });
});

describe('window controls', () => {
  it('forwards minimize, maximize, close and quit', () => {
    setup();
    exposed.minimize();
    exposed.maximize();
    exposed.closeWin();
    exposed.quitApp();
    expect(state.invoke.mock.calls.map((call) => call[0])).toEqual([
      'window:minimize',
      'window:maximize',
      'window:close',
      'app:quit'
    ]);
  });
});

describe('keyboard shortcuts', () => {
  it('navigates with Alt+digit', () => {
    setup();
    const cases: Array<[string, string]> = [
      ['1', '/'],
      ['2', '/library'],
      ['3', '/explorer'],
      ['4', '/online'],
      ['5', '/downloads'],
      ['6', '/settings']
    ];
    for (const [key, path] of cases) {
      const event = new KeyboardEvent('keydown', { key, altKey: true, cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(state.router.push).toHaveBeenLastCalledWith(path);
    }
  });

  it('ignores shortcuts with modifiers or unknown keys', () => {
    setup();
    const ctrl = new KeyboardEvent('keydown', {
      key: '2',
      altKey: true,
      ctrlKey: true,
      cancelable: true
    });
    document.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);

    const noAlt = new KeyboardEvent('keydown', { key: '2', cancelable: true });
    document.dispatchEvent(noAlt);
    expect(noAlt.defaultPrevented).toBe(false);

    const unknown = new KeyboardEvent('keydown', { key: '9', altKey: true, cancelable: true });
    document.dispatchEvent(unknown);
    expect(unknown.defaultPrevented).toBe(false);
    expect(state.router.push).not.toHaveBeenCalled();
  });
});

describe('view metadata', () => {
  it('labels known routes and ignores unknown ones', () => {
    setup();
    expect(exposed.viewLabel.value).toBe('nav.home');

    const labels: Array<[string, string]> = [
      ['library', 'nav.library'],
      ['player', 'nav.player'],
      ['audio', 'nav.player'],
      ['online', 'nav.online'],
      ['downloads', 'nav.downloads'],
      ['sources', 'sources.title'],
      ['explorer', 'nav.explorer'],
      ['settings', 'nav.settings']
    ];
    for (const [name, label] of labels) {
      state.route.name = name;
      expect(exposed.viewLabel.value).toBe(label);
    }

    state.route.name = 'unknown';
    expect(exposed.viewLabel.value).toBe('');
  });

  it('shows actions for selected routes', () => {
    setup();
    for (const name of [
      'home',
      'library',
      'player',
      'audio',
      'settings',
      'explorer',
      'downloads'
    ]) {
      state.route.name = name;
      expect(exposed.showViewActions.value).toBe(true);
    }
    state.route.name = 'online';
    expect(exposed.showViewActions.value).toBe(false);
  });

  it('marks only searchable routes', () => {
    setup();
    for (const name of ['library', 'explorer', 'downloads']) {
      state.route.name = name;
      expect(exposed.viewSearchable.value).toBe(true);
    }
    state.route.name = 'home';
    expect(exposed.viewSearchable.value).toBe(false);
  });
});

describe('navigation actions', () => {
  it('navigates and closes the dropdown', () => {
    setup();
    exposed.toggleDropdown('view');
    exposed.navigateAndClose('/library');
    expect(state.router.push).toHaveBeenCalledWith('/library');
    expect(exposed.openDropdown.value).toBeNull();
  });

  it('toggles view search only on searchable routes', () => {
    setup();
    state.route.name = 'library';
    exposed.toggleDropdown('view');
    exposed.toggleViewSearch();
    expect(state.ui.toggleViewSearch).toHaveBeenCalled();
    expect(exposed.openDropdown.value).toBeNull();

    state.route.name = 'online';
    exposed.toggleViewSearch();
    expect(state.ui.toggleViewSearch).toHaveBeenCalledTimes(1);
  });

  it('navigates to a settings tab', () => {
    setup();
    exposed.toggleDropdown('help');
    exposed.navigateSettingsTab('shortcuts');
    expect(state.router.push).toHaveBeenCalledWith({
      path: '/settings',
      query: { tab: 'shortcuts' }
    });
    expect(exposed.openDropdown.value).toBeNull();
  });

  it('wraps actions so they close the dropdown', () => {
    setup();
    const action = vi.fn();
    exposed.toggleDropdown('file');
    const wrapped = exposed.actionClose(action);
    wrapped();
    expect(action).toHaveBeenCalled();
    expect(exposed.openDropdown.value).toBeNull();
  });
});

describe('lifecycle', () => {
  it('wires listeners and the maximized event', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    setup();
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function));

    state.onMaximized?.(true);
    expect(exposed.isMaximized.value).toBe(true);
    state.onMaximized?.(false);
    expect(exposed.isMaximized.value).toBe(false);
  });

  it('cleans up listeners and subscriptions on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    setup();
    wrapper!.unmount();
    wrapper = null;
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    expect(state.offMaximized).toHaveBeenCalled();
  });

  it('exposes the stores and translation helper', () => {
    setup();
    expect(exposed.player).toBe(state.player);
    expect(exposed.ui).toBe(state.ui);
    expect(exposed.t('x')).toBe('x');
  });
});
