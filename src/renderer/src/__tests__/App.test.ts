import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';
import AppShell from '../App.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  appearance: null as any,
  player: null as any,
  fx: null as any,
  ui: null as any,
  library: null as any,
  plugins: null as any,
  route: null as any,
  router: null as any,
  activeShortcut: null as string | null,
  navBindings: [] as Array<{ shortcut: string; path: string }>,
  pluginShortcut: null as string | null,
  ipcUnregister: vi.fn(),
  session: null as any,
  theme: null as any,
  alwaysOnTop: null as any,
  audioPip: null as any,
  mediaSession: null as any,
  moduleManager: null as any,
  audioEngine: null as any,
  handlePlayerShortcut: vi.fn(),
  openMediaFiles: vi.fn(),
  dropped: [] as string[],
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  unsubs: [] as Array<ReturnType<typeof vi.fn>>,
  markReady: vi.fn(),
  loggerError: vi.fn(),
  loadLocale: vi.fn(),
  i18nT: vi.fn((key: string) => key),
  t: vi.fn((key: string) => key),
  coreShell: false
}));

vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => state.router
}));
vi.mock('pinia', () => ({
  storeToRefs: () => ({ appearance: state.appearance }),
  defineStore: () => () => ({})
}));
vi.mock('../i18n', () => ({
  i18n: { global: { t: state.i18nT } },
  loadLocaleMessages: state.loadLocale
}));
vi.mock('../stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('../stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('../stores/audioFx', () => ({ useAudioFxStore: () => state.fx }));
vi.mock('../stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('../stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('../stores/plugins', () => ({ usePluginsStore: () => state.plugins }));
vi.mock('../utils/shortcuts', () => ({
  matchesShortcut: (shortcut: string) => shortcut === state.activeShortcut,
  matchesPluginShortcut: () => state.pluginShortcut,
  navShortcutBindings: () => state.navBindings
}));
vi.mock('../composables/useAppIpcEvents', () => ({
  registerAppIpc: () => state.ipcUnregister
}));
vi.mock('../composables/useDiscordPresence', () => ({ useDiscordPresence: vi.fn() }));
vi.mock('../composables/useCoreSync', () => ({ useCoreSync: vi.fn() }));
vi.mock('../composables/playerShortcutHandler', () => ({
  handlePlayerShortcutKeydown: state.handlePlayerShortcut
}));
vi.mock('../modules/ModuleManager', () => ({
  get moduleManager() {
    return state.moduleManager;
  }
}));
vi.mock('../composables/useAudioPiP', () => ({ useAudioPiP: () => state.audioPip }));
vi.mock('../composables/useTheme', () => ({ getThemeEngine: () => state.theme }));
vi.mock('../composables/useNewVideoNotifications', () => ({ useNewVideoNotifications: vi.fn() }));
vi.mock('../composables/useUpdater', () => ({ useUpdater: vi.fn() }));
vi.mock('../composables/useMediaSession', () => ({ useMediaSession: () => state.mediaSession }));
vi.mock('../composables/useScrobbling', () => ({ useScrobbling: vi.fn() }));
vi.mock('../composables/useToolMessages', () => ({ useToolMessages: vi.fn() }));
vi.mock('../composables/useSessionPersistence', () => ({
  useSessionPersistence: () => state.session
}));
vi.mock('../composables/useAlwaysOnTop', () => ({ useAlwaysOnTop: () => state.alwaysOnTop }));
vi.mock('../composables/useViewTransitions', () => ({
  supportsViewTransitions: () => false,
  useViewTransitions: vi.fn()
}));
vi.mock('../composables/useOpenMedia', () => ({ openMediaFiles: state.openMediaFiles }));
vi.mock('../utils/fileDrag', () => ({ getDroppedFilePaths: () => state.dropped }));
vi.mock('../modules/audioEngine', () => ({
  get audioEngine() {
    return state.audioEngine;
  }
}));
vi.mock('../utils/bootMetrics', () => ({ markRendererReady: state.markReady }));
vi.mock('../utils/runtimeMode', () => ({ isCoreShell: () => state.coreShell }));
vi.mock('../utils/bootGuard', () => ({
  guardBootStep: async (fn: () => unknown, onError: (error: unknown) => void) => {
    try {
      await fn();
    } catch (error) {
      onError(error);
    }
  }
}));
vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));

const lazyModule = vi.hoisted(() => (name: string, emits: string[] = []) => ({
  __esModule: true,
  default: { name, emits, template: `<div data-testid="${name}" />` }
}));
vi.mock('@renderer/components/FirstRunWizard.vue', () => lazyModule('first-run-wizard', ['close']));
vi.mock('@renderer/components/player/QueuePanel.vue', () => lazyModule('queue-panel'));
vi.mock('@renderer/components/player/SubtitlePanel.vue', () => lazyModule('subtitle-panel'));
vi.mock('@renderer/components/player/Equalizer.vue', () => lazyModule('equalizer'));
vi.mock('@renderer/components/layout/AppSearch.vue', () => lazyModule('app-search'));
vi.mock('@renderer/components/ToastNotification.vue', () => lazyModule('toast'));
vi.mock('@renderer/components/ContextMenu.vue', () => lazyModule('context-menu'));

const MenuStub = { name: 'AppMenu', template: '<div data-testid="app-menu" />' };
const DependencyStub = { name: 'DependencyBanner', template: '<div data-testid="dependency" />' };
const UpdateStub = { name: 'UpdateBanner', template: '<div data-testid="update" />' };
const SidebarStub = { name: 'Sidebar', template: '<div data-testid="sidebar" />' };
const PlayerBarStub = { name: 'PlayerBar', template: '<div data-testid="player-bar" />' };
const StatusBarStub = { name: 'StatusBar', template: '<div data-testid="status-bar" />' };
const BoundaryStub = {
  name: 'ErrorBoundary',
  template: '<div data-testid="boundary"><slot /></div>'
};
const RouterViewStub = { name: 'RouterView', template: '<div data-testid="router-view" />' };

let wrapper: VueWrapper | null = null;

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await vi.dynamicImportSettled();
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await nextTick();
}

function mountApp() {
  wrapper = mount(AppShell, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AppMenu: MenuStub,
        DependencyBanner: DependencyStub,
        UpdateBanner: UpdateStub,
        Sidebar: SidebarStub,
        PlayerBar: PlayerBarStub,
        StatusBar: StatusBarStub,
        ErrorBoundary: BoundaryStub,
        RouterView: RouterViewStub
      }
    }
  });
  return wrapper;
}

function key(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event;
}

function dropEvent(options: {
  types?: string[];
  dropped?: string[];
  prevented?: boolean;
  dropEffect?: string;
}) {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: options.types ?? ['Files'],
      dropEffect: options.dropEffect ?? 'none',
      files: []
    }
  });
  return event;
}

beforeEach(() => {
  vi.useRealTimers();
  state.settings = reactive({
    isLoaded: false,
    appearance: {
      glassAlpha: 100,
      alwaysOnTop: false,
      sidebarPosition: 'left',
      locale: 'en',
      audioPipDock: 'bottom-right',
      audioPipAutoShow: true
    },
    playback: {
      visualization: { mode: 'circle' },
      defaultVolume: 0.6,
      autoPauseOnFocusLoss: false
    },
    general: { restoreSession: true, firstRunDone: true },
    shortcuts: { search: 'search', 'view-search': 'view-search' },
    load: vi.fn(async () => undefined),
    updatePlayback: vi.fn(),
    saveImmediate: vi.fn(),
    updateGeneral: vi.fn()
  });
  state.appearance = ref(state.settings.appearance);
  state.player = reactive({
    currentTrack: null,
    streamPending: null,
    isPlaying: false,
    queueVisible: false,
    subtitlePanelVisible: false,
    pause: vi.fn(),
    setVolume: vi.fn(),
    toggleQueue: vi.fn(),
    toggleSubtitlePanel: vi.fn()
  });
  state.fx = reactive({ equalizerVisible: false });
  state.ui = {
    setupWizardVisible: false,
    toggleGlobalSearch: vi.fn(),
    toggleViewSearch: vi.fn(),
    openSearch: vi.fn(),
    notify: vi.fn(),
    hideContextMenu: vi.fn(),
    closeSearch: vi.fn(),
    openSetupWizard: vi.fn(),
    closeSetupWizard: vi.fn()
  };
  state.library = { loadFromDisk: vi.fn(async () => undefined) };
  state.plugins = { dispatchShortcut: vi.fn(() => false) };
  state.route = reactive({ name: 'home' });
  state.router = { push: vi.fn() };
  state.activeShortcut = null;
  state.navBindings = [{ shortcut: 'nav-library', path: '/library' }];
  state.pluginShortcut = null;
  state.ipcUnregister = vi.fn();
  state.session = {
    persistNow: vi.fn(),
    restore: vi.fn(async () => undefined)
  };
  state.theme = { applyTheme: vi.fn(), dispose: vi.fn() };
  state.alwaysOnTop = { apply: vi.fn(), init: vi.fn(async () => undefined) };
  state.audioPip = {
    dock: ref('bottom-right'),
    setAutoShow: vi.fn(),
    show: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined)
  };
  state.mediaSession = { dispose: vi.fn() };
  state.moduleManager = {
    getActive: vi.fn(() => null),
    switchTo: vi.fn(async () => undefined),
    deactivateAll: vi.fn()
  };
  state.audioEngine = { warmUp: vi.fn() };
  state.handlePlayerShortcut.mockReset();
  state.openMediaFiles.mockReset();
  state.dropped = [];
  state.handlers = {};
  state.unsubs = [];
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.send.mockReset();
  state.on.mockReset();
  state.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    state.handlers[event] = cb;
    const unsub = vi.fn();
    state.unsubs.push(unsub);
    return unsub;
  });
  state.markReady.mockClear();
  state.loggerError.mockClear();
  state.loadLocale.mockReset();
  state.loadLocale.mockResolvedValue(undefined);
  state.coreShell = false;
  localStorage.clear();
  localStorage.setItem('onda.viz.splash-default-v1', '1');
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1400 });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
    cb();
    return 1;
  });
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    send: state.send,
    on: state.on
  };
  document.body.innerHTML = '';
  document.body.removeAttribute('data-shortcut-recording');
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('boot', () => {
  it('runs every boot step and reports readiness', async () => {
    mountApp();
    await flush();

    expect(state.settings.load).toHaveBeenCalled();
    expect(state.theme.applyTheme).toHaveBeenCalled();
    expect(state.alwaysOnTop.init).toHaveBeenCalled();
    expect(state.loadLocale).toHaveBeenCalledWith('en');
    expect(state.library.loadFromDisk).toHaveBeenCalled();
    expect(state.player.setVolume).toHaveBeenCalledWith(0.6);
    expect(state.audioPip.dock.value).toBe('bottom-right');
    expect(state.audioPip.setAutoShow).toHaveBeenCalledWith(true);
    expect(state.ipcUnregister).not.toHaveBeenCalled();
    expect(state.markReady).toHaveBeenCalled();
    expect(state.invoke).toHaveBeenCalledWith('app:rendererReady');
    expect(state.moduleManager.switchTo).toHaveBeenCalledWith('home');
    expect(state.audioEngine.warmUp).toHaveBeenCalled();
    expect(state.session.restore).toHaveBeenCalledWith(state.router);
  });

  it('opens the setup wizard for a first run profile', async () => {
    state.settings.general.firstRunDone = false;
    mountApp();
    await flush();
    expect(state.ui.openSetupWizard).toHaveBeenCalled();
  });

  it('keeps going when boot steps fail', async () => {
    state.settings.load.mockRejectedValueOnce(new Error('settings down'));
    state.invoke.mockRejectedValueOnce(new Error('ready down'));
    mountApp();
    await flush();

    expect(state.loggerError).toHaveBeenCalledWith(
      'App',
      'boot step failed — continuing with defaults',
      expect.any(Error)
    );
    expect(state.markReady).toHaveBeenCalled();
  });

  it('skips standalone-only boot work for auxiliary windows', async () => {
    state.route.name = 'explorer-window';
    state.settings.general.restoreSession = true;
    mountApp();
    await flush();

    expect(state.alwaysOnTop.init).not.toHaveBeenCalled();
    expect(state.session.restore).not.toHaveBeenCalled();
    expect(wrapper!.findAll('[data-testid="app-menu"]')).toHaveLength(0);
    expect(wrapper!.findAll('[data-testid="status-bar"]')).toHaveLength(0);
  });

  it('migrates the old splash visualization once', async () => {
    localStorage.removeItem('onda.viz.splash-default-v1');
    mountApp();
    await flush();

    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: { mode: 'splash' }
    });
    expect(state.settings.saveImmediate).toHaveBeenCalled();
    expect(localStorage.getItem('onda.viz.splash-default-v1')).toBe('1');

    wrapper!.unmount();
    state.settings.updatePlayback.mockClear();
    mountApp();
    await flush();
    expect(state.settings.updatePlayback).not.toHaveBeenCalled();
  });

  it('migrates the old first-run localStorage flag', async () => {
    state.settings.general.firstRunDone = false;
    localStorage.setItem('onda-first-run-done', '1');
    mountApp();
    await flush();
    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ firstRunDone: true });
  });

  it('loads settings only when not already loaded', async () => {
    state.settings.isLoaded = true;
    mountApp();
    await flush();
    expect(state.settings.load).not.toHaveBeenCalled();
  });
});

describe('layout', () => {
  it('renders chrome for the main window', async () => {
    state.player.currentTrack = { type: 'audio' };
    mountApp();
    await flush();

    expect(wrapper!.findAll('[data-testid="app-menu"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid="sidebar"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid="player-bar"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid="status-bar"]')).toHaveLength(1);
    expect(wrapper!.get('#main-content').attributes('data-route')).toBe('home');
  });

  it('hides chrome for tool and viewer routes', async () => {
    state.route.name = 'image-viewer';
    state.player.currentTrack = { type: 'audio' };
    mountApp();
    await flush();

    expect(wrapper!.findAll('[data-testid="app-menu"]')).toHaveLength(0);
    expect(wrapper!.findAll('[data-testid="player-bar"]')).toHaveLength(0);
    expect(wrapper!.findAll('[data-testid="external-drop-overlay"]')).toHaveLength(0);
  });

  it('uses the sidebar position from settings', async () => {
    state.settings.appearance.sidebarPosition = 'right';
    mountApp();
    await flush();
    expect(wrapper!.findAll('[data-testid="sidebar"]')).toHaveLength(1);
  });

  it('applies the glass and maximized classes', async () => {
    state.settings.appearance.glassAlpha = 40;
    mountApp();
    await flush();

    const root = wrapper!.get('[data-testid="app-root"]');
    expect(root.classes()).toContain('app-root-glass');
    expect(root.classes()).not.toContain('is-maximized');

    state.handlers['window:maximized'](true);
    await flush();
    expect(wrapper!.get('[data-testid="app-root"]').classes()).toContain('is-maximized');
  });

  it('hides banners while the setup wizard is open and closes it', async () => {
    state.ui.setupWizardVisible = true;
    mountApp();
    await flush();

    expect(wrapper!.findAll('[data-testid="dependency"]')).toHaveLength(0);
    expect(wrapper!.findAll('[data-testid="update"]')).toHaveLength(0);
    expect(wrapper!.findAll('[data-testid="first-run-wizard"]')).toHaveLength(1);

    wrapper!.findComponent({ name: 'first-run-wizard' }).vm.$emit('close');
    expect(state.ui.closeSetupWizard).toHaveBeenCalled();
  });

  it('shows queue, subtitles and equalizer panels', async () => {
    state.player.queueVisible = true;
    state.player.subtitlePanelVisible = true;
    state.fx.equalizerVisible = true;
    mountApp();
    await flush();

    expect(wrapper!.findAll('[data-testid="queue-panel"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid="subtitle-panel"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid="equalizer"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid="app-search"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid="toast"]')).toHaveLength(1);
    expect(wrapper!.findAll('[data-testid="context-menu"]')).toHaveLength(1);
  });

  it('renders narrow overlay backdrops and toggles panels', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 });
    state.player.queueVisible = true;
    state.player.subtitlePanelVisible = true;
    mountApp();
    await flush();

    const overlays = wrapper!.findAll('.absolute.inset-0.z-20');
    expect(overlays).toHaveLength(2);
    await overlays[0].trigger('click');
    await overlays[1].trigger('click');
    expect(state.player.toggleQueue).toHaveBeenCalled();
    expect(state.player.toggleSubtitlePanel).toHaveBeenCalled();
  });

  it('shows the player bar only for media tracks outside player routes', async () => {
    state.player.currentTrack = { type: 'video' };
    mountApp();
    await flush();
    expect(wrapper!.findAll('[data-testid="player-bar"]')).toHaveLength(0);

    state.player.currentTrack = { type: 'stream' };
    await flush();
    expect(wrapper!.findAll('[data-testid="player-bar"]')).toHaveLength(1);

    state.route.name = 'player';
    await flush();
    expect(wrapper!.findAll('[data-testid="player-bar"]')).toHaveLength(0);
  });

  it('shows the player bar for a pending stream', async () => {
    state.player.streamPending = { type: 'stream' };
    mountApp();
    await flush();
    expect(wrapper!.findAll('[data-testid="player-bar"]')).toHaveLength(1);
  });
});

describe('watchers', () => {
  it('applies always-on-top only outside standalone windows', async () => {
    mountApp();
    await flush();
    state.settings.appearance.alwaysOnTop = true;
    await flush();
    expect(state.alwaysOnTop.apply).toHaveBeenCalledWith(true);

    state.alwaysOnTop.apply.mockClear();
    state.route.name = 'tool-batch-images';
    await flush();
    state.settings.appearance.alwaysOnTop = false;
    await flush();
    expect(state.alwaysOnTop.apply).not.toHaveBeenCalled();
  });

  it('focuses the main content after navigation', async () => {
    mountApp();
    await flush();
    state.route.name = 'library';
    await flush();
    expect(document.activeElement).toBe(wrapper!.get('#main-content').element);
  });

  it('persists locale changes', async () => {
    mountApp();
    await flush();
    state.settings.appearance.locale = 'pl';
    await flush();

    expect(state.loadLocale).toHaveBeenCalledWith('pl');
    expect(state.send).toHaveBeenCalledWith('pip:locale', 'pl');
    expect(localStorage.getItem('onda-locale')).toBe('pl');
  });

  it('forwards default volume changes', async () => {
    mountApp();
    await flush();
    state.player.setVolume.mockClear();
    state.settings.playback.defaultVolume = 0.25;
    await flush();
    expect(state.player.setVolume).toHaveBeenCalledWith(0.25);
  });

  it('navigates to the player for video tracks', async () => {
    mountApp();
    await flush();
    state.player.currentTrack = { type: 'video' };
    await flush();
    expect(state.router.push).toHaveBeenCalledWith('/player');

    state.router.push.mockClear();
    state.player.currentTrack = { type: 'audio' };
    await flush();
    expect(state.router.push).not.toHaveBeenCalled();
  });

  it('refreshes narrow layout on resize', async () => {
    state.player.queueVisible = true;
    mountApp();
    await flush();
    expect(wrapper!.findComponent({ name: 'queue-panel' }).classes()).toContain('w-75');

    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 });
    window.dispatchEvent(new Event('resize'));
    await flush();
    expect(wrapper!.findComponent({ name: 'queue-panel' }).classes()).toContain('absolute');
  });
});

describe('external drag and drop', () => {
  it('tracks drag depth and shows the overlay', async () => {
    mountApp();
    await flush();

    const enter = (types: string[]) => {
      const event = new Event('dragenter', { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: { types } });
      window.dispatchEvent(event);
    };

    enter(['text/plain']);
    expect(wrapper!.findAll('[data-testid="external-drop-overlay"]')).toHaveLength(0);

    enter(['Files']);
    enter(['Files']);
    await flush();
    expect(wrapper!.findAll('[data-testid="external-drop-overlay"]')).toHaveLength(1);

    window.dispatchEvent(new Event('dragleave'));
    await flush();
    expect(wrapper!.findAll('[data-testid="external-drop-overlay"]')).toHaveLength(1);

    window.dispatchEvent(new Event('dragleave'));
    await flush();
    expect(wrapper!.findAll('[data-testid="external-drop-overlay"]')).toHaveLength(0);
  });

  it('prevents default and sets the copy cursor on dragover', async () => {
    mountApp();
    await flush();
    const event = new Event('dragover', { bubbles: true, cancelable: true }) as DragEvent;
    const transfer = { types: ['Files'], dropEffect: 'none' };
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe('copy');
  });

  it('opens dropped media files unless a child handled the drop', async () => {
    mountApp();
    await flush();

    state.dropped = [];
    window.dispatchEvent(dropEvent({ types: ['Files'] }));
    expect(state.openMediaFiles).not.toHaveBeenCalled();

    state.dropped = ['C:\\media\\a.mp4'];
    window.dispatchEvent(dropEvent({ types: ['Files'] }));
    expect(state.openMediaFiles).toHaveBeenCalledWith(['C:\\media\\a.mp4'], state.router);

    state.openMediaFiles.mockClear();
    const prevented = dropEvent({ types: ['Files'] });
    prevented.preventDefault();
    window.dispatchEvent(prevented);
    expect(state.openMediaFiles).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('dragend'));
    expect(wrapper!.findAll('[data-testid="external-drop-overlay"]')).toHaveLength(0);
  });
});

describe('global shortcuts', () => {
  beforeEach(async () => {
    mountApp();
    await flush();
  });

  it('toggles global search and ignores it while typing', async () => {
    state.activeShortcut = 'search';
    const event = key({ key: 'k', ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(state.ui.toggleGlobalSearch).toHaveBeenCalledTimes(1);

    state.ui.toggleGlobalSearch.mockClear();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    key({ key: 'k', ctrlKey: true });
    expect(state.ui.toggleGlobalSearch).not.toHaveBeenCalled();
  });

  it('routes view search by current route', async () => {
    state.activeShortcut = 'view-search';
    state.route.name = 'library';
    key({ key: 'f', ctrlKey: true });
    expect(state.ui.toggleViewSearch).toHaveBeenCalled();

    state.ui.toggleViewSearch.mockClear();
    state.ui.notify.mockClear();
    state.route.name = 'home';
    key({ key: 'f', ctrlKey: true });
    expect(state.ui.notify).toHaveBeenCalledWith('info', 'menu.viewSearchUnavailable');

    state.ui.openSearch.mockClear();
    const host = document.createElement('div');
    host.setAttribute('data-app-search', '');
    const input = document.createElement('input');
    host.appendChild(input);
    document.body.appendChild(host);
    input.focus();
    key({ key: 'f', ctrlKey: true });
    expect(state.ui.openSearch).toHaveBeenCalledWith('view');
  });

  it('navigates with nav shortcuts unless recording or typing', async () => {
    state.activeShortcut = 'nav-library';
    const event = key({ key: 'l', ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(state.router.push).toHaveBeenCalledWith('/library');

    state.router.push.mockClear();
    document.body.dataset.shortcutRecording = '1';
    key({ key: 'l', ctrlKey: true });
    expect(state.router.push).not.toHaveBeenCalled();
  });

  it('closes menus and search on Escape', async () => {
    key({ key: 'Escape' });
    expect(state.ui.hideContextMenu).toHaveBeenCalled();
    expect(state.ui.closeSearch).toHaveBeenCalled();
  });

  it('dispatches plugin shortcuts and falls through to player shortcuts', async () => {
    state.pluginShortcut = 'global.actions';
    state.plugins.dispatchShortcut.mockReturnValueOnce(true);
    const event = key({ key: 'p' });
    expect(event.defaultPrevented).toBe(true);
    expect(state.plugins.dispatchShortcut).toHaveBeenCalledWith('global.actions');
    expect(state.handlePlayerShortcut).not.toHaveBeenCalled();

    state.plugins.dispatchShortcut.mockReturnValueOnce(false);
    key({ key: 'p' });
    expect(state.handlePlayerShortcut).toHaveBeenCalled();
  });
});

describe('mouse and window events', () => {
  it('closes the context menu on outside mousedown only', async () => {
    mountApp();
    await flush();

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.ui.hideContextMenu).toHaveBeenCalledTimes(1);

    state.ui.hideContextMenu.mockClear();
    const menu = document.createElement('div');
    menu.id = 'context-menu';
    const child = document.createElement('span');
    menu.appendChild(child);
    document.body.appendChild(menu);
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.ui.hideContextMenu).not.toHaveBeenCalled();

    const submenu = document.createElement('div');
    submenu.id = 'context-submenu';
    document.body.appendChild(submenu);
    submenu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.ui.hideContextMenu).not.toHaveBeenCalled();
  });

  it('pauses on focus loss when configured', async () => {
    state.settings.playback.autoPauseOnFocusLoss = true;
    state.player.isPlaying = true;
    mountApp();
    await flush();

    window.dispatchEvent(new Event('blur'));
    expect(state.player.pause).toHaveBeenCalled();

    state.player.pause.mockClear();
    state.player.isPlaying = false;
    window.dispatchEvent(new Event('blur'));
    expect(state.player.pause).not.toHaveBeenCalled();
  });

  it('handles the session handoff request', async () => {
    mountApp();
    await flush();
    state.handlers['app:prepare-session-handoff']();
    expect(state.session.persistNow).toHaveBeenCalled();
    expect(state.send).toHaveBeenCalledWith('app:session-handoff-ready');
  });

  it('cleans up on unmount', async () => {
    mountApp();
    await flush();
    wrapper!.unmount();
    wrapper = null;

    expect(state.moduleManager.deactivateAll).toHaveBeenCalled();
    expect(state.mediaSession.dispose).toHaveBeenCalled();
    expect(state.theme.dispose).toHaveBeenCalled();
    expect(state.ipcUnregister).toHaveBeenCalled();
    for (const unsub of state.unsubs) expect(unsub).toHaveBeenCalled();

    state.ui.hideContextMenu.mockClear();
    key({ key: 'Escape' });
    expect(state.ui.hideContextMenu).not.toHaveBeenCalled();
  });
});
