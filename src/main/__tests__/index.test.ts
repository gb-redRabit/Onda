import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  app: null as any,
  appHandlers: {} as Record<string, (...args: any[]) => void>,
  readyResolve: null as any,
  readyPromise: null as any,
  lock: true,
  windows: [] as any[],
  created: [] as any[],
  compactCreated: [] as any[],
  ipcHandlers: {} as Record<string, (...args: any[]) => any>,
  ipcOnce: {} as Record<string, (...args: any[]) => void>,
  ipcRemoved: vi.fn(),
  calls: [] as string[],
  splashActive: true,
  rendererReady: false,
  splash: {
    start: vi.fn(),
    send: vi.fn(),
    isActive: vi.fn(() => state.splashActive),
    isRendererReady: vi.fn(() => state.rendererReady),
    forceClose: vi.fn(),
    onMainReady: vi.fn(),
    onRendererReady: vi.fn(),
    onMinTimerDone: vi.fn()
  },
  pip: {
    setMainWindow: vi.fn(),
    init: vi.fn(),
    destroy: vi.fn(),
    hide: vi.fn()
  },
  audioPip: {
    setMainWindow: vi.fn(),
    init: vi.fn(),
    destroy: vi.fn(),
    hide: vi.fn()
  },
  server: { port: 4321, token: 'tok' },
  seed: { folders: 2, roots: 1 },
  compactState: { mode: 'main' as string, alwaysOnTop: false, restoreSessionOnce: false },
  saveCompact: vi.fn(),
  createMediaServer: vi.fn(),
  extractMediaPaths: vi.fn((paths: string[]) => paths),
  shouldHide: vi.fn(() => false),
  closeToTray: vi.fn(() => true),
  hasTray: vi.fn(() => true),
  forward: vi.fn(),
  resetListening: vi.fn(),
  pending: ['pending.mp4'],
  relaunch: vi.fn(),
  sendToWindow: vi.fn(),
  markBootPhase: vi.fn(() => 5),
  markBootStart: vi.fn(),
  registerIPC: vi.fn(),
  registerWindowHandlers: vi.fn(),
  registerProtocol: vi.fn(),
  registerMediaUrl: vi.fn(),
  setMediaServerUrl: vi.fn(),
  safety: vi.fn(),
  hardening: vi.fn(),
  recovery: vi.fn(),
  setupFileLogging: vi.fn(),
  initAutoUpdater: vi.fn(),
  replayUpdater: vi.fn(),
  configureAutoCheck: vi.fn(),
  syncSubs: vi.fn(),
  syncLinks: vi.fn(),
  startCore: vi.fn(),
  setupTray: vi.fn(),
  destroyTray: vi.fn(),
  globalShortcuts: vi.fn(),
  unregisterAll: vi.fn(),
  startWatchdog: vi.fn(),
  graceful: vi.fn(),
  initLocale: vi.fn(),
  setAppId: vi.fn(),
  watchShortcuts: vi.fn(),
  showErrorBox: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  isDev: false,
  fromWebContents: vi.fn(() => ({ id: 7 })),
  getAllWindows: vi.fn(() => state.windows),
  alwaysOnTop: false
}));

function makeWindow(id = 1) {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const webHandlers: Record<string, (...args: any[]) => void> = {};
  const webOnce: Record<string, (...args: any[]) => void> = {};
  const win: any = {
    id,
    destroyed: false,
    handlers,
    webHandlers,
    webOnce,
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      handlers[event] = cb;
    }),
    once: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    isDestroyed(this: { destroyed: boolean }) {
      return this.destroyed;
    },
    isAlwaysOnTop: vi.fn(() => state.alwaysOnTop),
    setAlwaysOnTop: vi.fn(),
    webContents: {
      id: id + 100,
      destroyed: false,
      send: vi.fn(),
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        webHandlers[event] = cb;
      }),
      once: vi.fn((event: string, cb: (...args: any[]) => void) => {
        webOnce[event] = cb;
      }),
      isDestroyed: vi.fn(() => false)
    }
  };
  return win;
}

vi.mock('electron', () => ({
  get app() {
    return state.app;
  },
  BrowserWindow: {
    fromWebContents: state.fromWebContents,
    getAllWindows: state.getAllWindows
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.ipcHandlers[channel] = fn;
    },
    once: (channel: string, fn: (...args: any[]) => void) => {
      state.ipcOnce[channel] = fn;
    },
    removeListener: state.ipcRemoved
  },
  globalShortcut: { unregisterAll: state.unregisterAll },
  dialog: { showErrorBox: state.showErrorBox }
}));
vi.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: state.setAppId },
  optimizer: { watchWindowShortcuts: state.watchShortcuts },
  is: {
    get dev() {
      return state.isDev;
    }
  }
}));
vi.mock('../media/media-server', () => ({
  createMediaServer: state.createMediaServer,
  addAllowedRoot: vi.fn()
}));
vi.mock('../protocol', () => ({ registerOndaProtocolHandler: state.registerProtocol }));
vi.mock('../windows/window-ipc', () => ({ registerWindowHandlers: state.registerWindowHandlers }));
vi.mock('../ipc/handlers', () => ({ registerIPC: state.registerIPC }));
vi.mock('../pip/pip-manager', () => ({ pipManager: state.pip }));
vi.mock('../pip/audio-pip-manager', () => ({ audioPipManager: state.audioPip }));
vi.mock('../../shared/logger', () => ({ logger: state.logger }));
vi.mock('../media/media-paths', () => ({ extractMediaPaths: state.extractMediaPaths }));
vi.mock('../media/media-url-args', () => ({
  setMediaServerUrl: state.setMediaServerUrl,
  registerMediaUrlHandler: state.registerMediaUrl
}));
vi.mock('../bootstrap/safety-nets', () => ({
  installProcessSafetyNets: state.safety,
  installSessionHardening: state.hardening,
  installRendererRecovery: state.recovery
}));
vi.mock('../log-file', () => ({ setupFileLogging: state.setupFileLogging }));
vi.mock('../updater', () => ({
  initAutoUpdater: state.initAutoUpdater,
  replayUpdaterEvent: state.replayUpdater
}));
vi.mock('../boot-timeline', () => ({
  markBootPhase: state.markBootPhase,
  markBootStart: state.markBootStart
}));
vi.mock('../updater-scheduler', () => ({ configureAutoCheck: state.configureAutoCheck }));
vi.mock('../ipc/subscriptions/subscriptions-handlers', () => ({
  syncSubscriptionsScheduler: state.syncSubs
}));
vi.mock('../ipc/providers/providers-handlers', () => ({
  syncLinkSubsScheduler: state.syncLinks
}));
vi.mock('../windows/close-behavior', () => ({
  shouldCloseToTray: state.closeToTray,
  shouldHideShellOnClose: state.shouldHide
}));
vi.mock('../windows/window-icon', () => ({ windowIcon: () => 'icon.png' }));
vi.mock('../windows/window-factory', () => ({
  createWindow: (options: any) => {
    const win = makeWindow(state.windows.length + 1);
    win.options = options;
    state.windows.push(win);
    state.created.push(win);
    return win;
  }
}));
vi.mock('../windows/window-presets', () => ({ GLASS_WINDOW_OPTS: { glass: true } }));
vi.mock('../windows/tray', () => ({
  destroyTray: state.destroyTray,
  hasTray: state.hasTray,
  setupTray: state.setupTray
}));
vi.mock('../windows/splash', () => ({
  SplashController: class {
    constructor(options: any) {
      state.calls.push('splash.ctor');
      (state.splash as any).options = options;
    }
    start = state.splash.start;
    send = state.splash.send;
    isActive = state.splash.isActive;
    isRendererReady = state.splash.isRendererReady;
    forceClose = state.splash.forceClose;
    onMainReady = state.splash.onMainReady;
    onRendererReady = state.splash.onRendererReady;
    onMinTimerDone = state.splash.onMinTimerDone;
  }
}));
vi.mock('../core/core-spike', () => ({ startCoreService: state.startCore }));
vi.mock('../compact/compact-window', () => ({
  createCompactWindow: (options: any) => {
    const win = makeWindow(state.windows.length + 1);
    win.options = options;
    state.windows.push(win);
    state.compactCreated.push(win);
    return win;
  }
}));
vi.mock('../compact/compact-state', () => ({
  loadCompactState: vi.fn(async () => state.compactState),
  saveCompactState: state.saveCompact
}));
vi.mock('../bootstrap/global-shortcuts', () => ({
  registerGlobalShortcuts: state.globalShortcuts
}));
vi.mock('../bootstrap/boot-watchdog', () => ({ startBootWatchdog: state.startWatchdog }));
vi.mock('../bootstrap/open-files', () => ({
  OpenFileForwarder: class {
    constructor(getShell: () => unknown, addRoot: (dir: string) => void) {
      (state as any).openFilesCtor = { getShell, addRoot };
    }
    forward = state.forward;
    resetListening = state.resetListening;
    takePending = () => state.pending;
  }
}));
vi.mock('../i18n-main', () => ({
  initMainLocale: state.initLocale,
  mainMessages: () => ({
    bootMediaServer: 'media',
    bootRestoringSettings: 'settings',
    bootStartingUi: 'ui',
    bootCreatingWindow: 'window',
    bootPipTray: 'pip',
    loadFailedTitle: 'Load failed',
    loadFailedMessage: (code: number, desc: string) => `Failed ${code} ${desc}`,
    loadFailedDevHint: ' dev hint'
  })
}));
vi.mock('../bootstrap/shutdown', () => ({ installGracefulShutdown: state.graceful }));
vi.mock('../bootstrap/seed-roots', () => ({
  seedMediaServerAndSettings: async () => state.seed
}));
vi.mock('../bootstrap/relaunch', () => ({ relaunchApp: state.relaunch }));
vi.mock('../utils/broadcast', () => ({ sendToWindow: state.sendToWindow }));

async function flush(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await Promise.resolve();
}

async function importModule(): Promise<void> {
  vi.resetModules();
  await import('../index');
}

async function boot(): Promise<void> {
  await importModule();
  state.readyResolve();
  await flush();
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.calls = [];
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && 'mockClear' in value) {
      (value as { mockClear: () => void }).mockClear();
    }
  }
  state.windows = [];
  state.created = [];
  state.compactCreated = [];
  state.appHandlers = {};
  state.ipcHandlers = {};
  state.ipcOnce = {};
  state.lock = true;
  state.splashActive = true;
  state.rendererReady = false;
  state.compactState = { mode: 'main', alwaysOnTop: false, restoreSessionOnce: false };
  state.alwaysOnTop = false;
  state.pending = ['pending.mp4'];
  state.isDev = false;
  for (const spy of Object.values(state.splash)) {
    if (typeof spy === 'function' && 'mockClear' in spy) (spy as any).mockClear();
  }
  for (const manager of [state.pip, state.audioPip]) {
    for (const fn of Object.values(manager)) {
      if (typeof fn === 'function' && 'mockClear' in fn) (fn as any).mockClear();
    }
  }
  state.saveCompact.mockReset();
  state.createMediaServer.mockReset();
  state.createMediaServer.mockResolvedValue(state.server);
  state.extractMediaPaths.mockReset();
  state.extractMediaPaths.mockImplementation((paths: string[]) =>
    paths.filter((path) => /\.(mp4|mkv|webm|mp3)$/i.test(path))
  );
  state.shouldHide.mockReset();
  state.shouldHide.mockReturnValue(false);
  state.closeToTray.mockReset();
  state.closeToTray.mockReturnValue(true);
  state.hasTray.mockReset();
  state.hasTray.mockReturnValue(true);
  state.forward.mockReset();
  state.relaunch.mockReset();
  state.sendToWindow.mockReset();
  state.markBootStart.mockClear();
  state.markBootPhase.mockReset();
  state.markBootPhase.mockReturnValue(5);
  state.logger.info.mockClear();
  state.logger.error.mockClear();
  state.logger.warn.mockClear();
  state.showErrorBox.mockClear();
  state.fromWebContents.mockReset();
  state.fromWebContents.mockReturnValue({ id: 7 });
  state.getAllWindows.mockReset();
  state.getAllWindows.mockReturnValue(state.windows);
  state.readyPromise = new Promise<void>((resolve) => (state.readyResolve = resolve));
  state.appHandlers = {};
  state.app = {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      state.appHandlers[event] = cb;
    }),
    whenReady: vi.fn(() => state.readyPromise),
    requestSingleInstanceLock: vi.fn(() => state.lock),
    quit: vi.fn(),
    setPath: vi.fn(),
    getPath: vi.fn(() => '/tmp/onda')
  };
  delete process.env.ONDA_USER_DATA_DIR;
  delete process.env.ONDA_COMPACT;
  delete process.env.ONDA_CORE_SHELL;
  delete process.env.ONDA_CORE_SPIKE;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.ONDA_USER_DATA_DIR;
  delete process.env.ONDA_COMPACT;
  delete process.env.ONDA_CORE_SHELL;
  delete process.env.ONDA_CORE_SPIKE;
});

describe('single instance', () => {
  it('quits immediately when the lock is unavailable', async () => {
    state.lock = false;
    await boot();

    expect(state.app.quit).toHaveBeenCalled();
    expect(state.created).toHaveLength(0);
    expect(state.markBootStart).toHaveBeenCalled();
  });

  it('moves userData before the lock when the env override is set', async () => {
    process.env.ONDA_USER_DATA_DIR = 'D:\\tmp\\onda';
    await importModule();
    expect(state.app.setPath).toHaveBeenCalledWith('userData', 'D:\\tmp\\onda');
  });

  it('forwards second-instance and open-file paths', async () => {
    await importModule();

    state.appHandlers['second-instance']({}, ['onda', 'C:\\a.mp4']);
    expect(state.forward).toHaveBeenCalledWith(['C:\\a.mp4']);

    const event = { preventDefault: vi.fn() };
    state.appHandlers['open-file'](event, 'C:\\b.mkv');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(state.forward).toHaveBeenLastCalledWith(['C:\\b.mkv']);
  });

  it('marks quitting on before-quit and skips shell cleanup afterwards', async () => {
    await boot();
    const win = state.created[0];
    state.appHandlers['before-quit']();
    win.destroyed = true;
    win.handlers['closed']();

    expect(state.pip.destroy).not.toHaveBeenCalled();
    expect(state.app.quit).not.toHaveBeenCalled();
  });
});

describe('boot', () => {
  it('starts the full main-window boot sequence', async () => {
    await boot();

    expect(state.setAppId).toHaveBeenCalledWith('com.onda.app');
    expect(state.initLocale).toHaveBeenCalled();
    expect(state.setupFileLogging).toHaveBeenCalled();
    expect(state.safety).toHaveBeenCalled();
    expect(state.hardening).toHaveBeenCalled();
    expect(state.splash.start).toHaveBeenCalled();
    expect(state.registerIPC).toHaveBeenCalled();
    expect(state.registerMediaUrl).toHaveBeenCalled();
    expect(state.setMediaServerUrl).toHaveBeenCalledWith('http://127.0.0.1:4321/tok');
    expect(state.registerProtocol).toHaveBeenCalled();
    expect(state.registerWindowHandlers).toHaveBeenCalled();
    expect(state.graceful).toHaveBeenCalled();
    expect(state.initAutoUpdater).toHaveBeenCalled();
    expect(state.configureAutoCheck).toHaveBeenCalled();
    expect(state.syncSubs).toHaveBeenCalled();
    expect(state.syncLinks).toHaveBeenCalled();
    expect(state.setupTray).toHaveBeenCalled();
    expect(state.globalShortcuts).toHaveBeenCalled();
    expect(state.startWatchdog).toHaveBeenCalled();
    expect(state.created).toHaveLength(1);
    expect(state.created[0].options.show).toBe(false);
    expect(state.pip.setMainWindow).toHaveBeenCalled();
    expect(state.pip.init).toHaveBeenCalled();
    expect(state.audioPip.init).toHaveBeenCalled();
  });

  it('starts compact + core shells from the environment', async () => {
    process.env.ONDA_COMPACT = '1';
    process.env.ONDA_CORE_SPIKE = '1';
    await boot();

    expect(state.compactCreated).toHaveLength(1);
    expect(state.created).toHaveLength(0);
    expect(state.startCore).toHaveBeenCalledWith({
      testShell: true,
      getShellWindow: expect.any(Function)
    });
    expect(state.ipcHandlers['app:isCoreShell']()).toBe(true);
    expect(state.ipcHandlers['app:getWindowMode']()).toBe('compact');
  });

  it('keeps the window hidden when started hidden', async () => {
    const argv = process.argv;
    process.argv = [...argv, '--hidden'];
    try {
      await boot();
      const win = state.created[0];
      state.splashActive = false;
      win.options.onReadyToShow(win);
      expect(win.show).not.toHaveBeenCalled();
    } finally {
      process.argv = argv;
    }
  });

  it('shows the window when the splash is gone', async () => {
    await boot();
    const win = state.created[0];
    state.splashActive = false;
    win.options.onReadyToShow(win);
    expect(win.show).toHaveBeenCalled();
  });

  it('fires the minimum splash timer and watchdog timeout', async () => {
    await boot();
    await vi.advanceTimersByTimeAsync(300);
    expect(state.splash.onMinTimerDone).toHaveBeenCalled();

    const watchdog = state.startWatchdog.mock.calls[0][0];
    watchdog.onTimeout();
    expect(state.splash.forceClose).toHaveBeenCalled();
  });
});

describe('ipc handlers', () => {
  beforeEach(async () => {
    await boot();
  });

  it('exposes shell and window state', async () => {
    expect(state.ipcHandlers['app:isCoreShell']()).toBe(false);
    expect(state.ipcHandlers['app:getWindowMode']()).toBe('main');
    await expect(state.ipcHandlers['app:getStartupMode']()).resolves.toBe('main');
    expect(state.ipcHandlers['app:getPendingFiles']()).toEqual(['pending.mp4']);
    expect(state.ipcHandlers['window:id']({ sender: { id: 7 } })).toBe(7);
  });

  it('validates startup mode changes and pin state', async () => {
    process.env.ONDA_COMPACT = '1';
    await boot();

    await state.ipcHandlers['app:setStartupMode']({}, 'main');
    expect(state.saveCompact).toHaveBeenCalledWith({ mode: 'main' });
    await state.ipcHandlers['app:setStartupMode']({}, 'bogus');
    expect(state.saveCompact).toHaveBeenCalledTimes(1);
  });

  it('persists pin and startup state when no compact window exists', async () => {
    await state.ipcHandlers['app:setCompactPinned']({}, true);
    expect(state.saveCompact).toHaveBeenCalledWith({ alwaysOnTop: true });
    expect(state.ipcHandlers['app:getCompactPinned']()).toBe(false);

    await state.ipcHandlers['app:setStartupMode']({}, 'main');
    expect(state.saveCompact).toHaveBeenCalledWith({ mode: 'main' });
    await state.ipcHandlers['app:setStartupMode']({}, 'bogus');
    expect(state.saveCompact).toHaveBeenCalledTimes(2);
  });

  it('consumes the restore-once flag', async () => {
    state.compactState.restoreSessionOnce = true;
    expect(await state.ipcHandlers['app:consumeRestoreOnce']()).toBe(true);
    expect(state.saveCompact).toHaveBeenCalledWith({ restoreSessionOnce: false });

    state.compactState.restoreSessionOnce = false;
    expect(await state.ipcHandlers['app:consumeRestoreOnce']()).toBe(false);
  });

  it('reports which shell owns the sender', async () => {
    const main = state.created[0];
    expect(state.ipcHandlers['app:getShellActive']({ sender: { id: main.webContents.id } })).toBe(
      true
    );
    expect(state.ipcHandlers['app:getShellActive']({ sender: { id: 999 } })).toBe(false);
  });

  it('handles renderer readiness and quit', async () => {
    state.ipcHandlers['app:rendererReady']({ sender: { id: 1 } });
    expect(state.splash.onRendererReady).toHaveBeenCalled();
    expect(state.replayUpdater).toHaveBeenCalledWith({ id: 1 });

    state.ipcHandlers['app:quit']();
    state.ipcHandlers['app:quit']();
    expect(state.app.quit).toHaveBeenCalledTimes(1);
  });
});

describe('main window wiring', () => {
  it('hides on close when the tray is available and quits after destruction', async () => {
    await boot();
    const win = state.created[0];
    state.shouldHide.mockReturnValue(true);

    const close = { preventDefault: vi.fn() };
    win.handlers['close'](close);
    expect(close.preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();

    win.destroyed = true;
    win.handlers['closed']();
    expect(state.pip.destroy).toHaveBeenCalled();
    expect(state.audioPip.destroy).toHaveBeenCalled();
    expect(state.app.quit).toHaveBeenCalled();
  });

  it('reports load and preload failures', async () => {
    await boot();
    const win = state.created[0];
    const failLoad = win.webHandlers['did-fail-load'];

    failLoad({}, -3, 'aborted', 'url', true);
    expect(state.showErrorBox).not.toHaveBeenCalled();

    failLoad({}, -105, 'dns', 'url', false);
    expect(state.showErrorBox).not.toHaveBeenCalled();

    failLoad({}, -105, 'dns', 'url', true);
    expect(state.showErrorBox).toHaveBeenCalledWith('Load failed', 'Failed -105 dns');
    expect(state.splash.forceClose).toHaveBeenCalled();

    state.isDev = true;
    failLoad({}, -105, 'dns', 'url', true);
    expect(state.showErrorBox).toHaveBeenLastCalledWith('Load failed', 'Failed -105 dns dev hint');

    win.webHandlers['preload-error']({}, '/preload.js', new Error('bad'));
    expect(state.logger.error).toHaveBeenCalledWith(
      'main',
      'preload-error /preload.js',
      expect.any(Error)
    );
  });

  it('resets open-file listening and broadcasts shell activity on load', async () => {
    await boot();
    const main = state.created[0];
    const compact = state.compactCreated[0];

    main.webHandlers['did-start-loading']();
    expect(state.resetListening).toHaveBeenCalled();

    main.webHandlers['did-finish-load']();
    expect(main.webContents.send).toHaveBeenCalledWith('app:shellActive', true);

    if (compact) {
      compact.handlers['show']();
      expect(compact.webContents.send).toHaveBeenCalledWith('compact:shown');
    }
  });

  it('recreates the window on activate when none exist', async () => {
    await boot();
    const created = state.created.length;
    state.getAllWindows.mockReturnValue([]);
    state.appHandlers['activate']();
    expect(state.created.length).toBe(created + 1);
    expect(state.pip.init).toHaveBeenCalled();
  });

  it('cleans up and quits on window-all-closed', async () => {
    await boot();
    state.appHandlers['window-all-closed']();
    expect(state.unregisterAll).toHaveBeenCalled();
    expect(state.destroyTray).toHaveBeenCalled();
    expect(state.pip.destroy).toHaveBeenCalled();
    expect(state.app.quit).toHaveBeenCalled();
  });
});

describe('window modes', () => {
  it('toggles between compact and main from the tray', async () => {
    process.env.ONDA_COMPACT = '1';
    await boot();
    const tray = state.setupTray.mock.calls[0][1];

    await tray.toggleMode();
    await flush();
    expect(state.saveCompact).toHaveBeenCalledWith({ mode: 'main' });
    expect(state.created).toHaveLength(1);

    await tray.toggleMode();
    await flush();
    expect(state.saveCompact).toHaveBeenLastCalledWith({ mode: 'compact' });
    expect(state.compactCreated[0].show).toHaveBeenCalled();
  });

  it('relaunches when switching from a legacy main shell', async () => {
    await boot();
    const promise = state.ipcHandlers['app:setWindowMode']({}, 'compact');
    await flush();
    state.ipcOnce['app:session-handoff-ready']?.();
    await vi.advanceTimersByTimeAsync(400);
    await promise;
    await flush();

    expect(state.saveCompact).toHaveBeenCalledWith({
      mode: 'compact',
      restoreSessionOnce: true
    });
    expect(state.relaunch).toHaveBeenCalledWith(300);
  });

  it('hides the previous shell audio PiP when switching', async () => {
    process.env.ONDA_COMPACT = '1';
    await boot();
    await state.ipcHandlers['app:setWindowMode']({}, 'main');
    await flush();

    expect(state.audioPip.hide).toHaveBeenCalled();
    expect(state.sendToWindow).toHaveBeenCalledWith(state.compactCreated[0], 'audio-pip:closed');
  });

  it('handles compact hide/show and recovery exhaustion', async () => {
    process.env.ONDA_COMPACT = '1';
    await boot();
    const compact = state.compactCreated[0];

    compact.handlers['hide']();
    expect(compact.webContents.send).toHaveBeenCalledWith('compact:hidden', { autoPip: true });

    compact.handlers['show']();
    expect(compact.webContents.send).toHaveBeenCalledWith('compact:shown');

    const recovery = state.recovery.mock.calls.find(
      (call: any[]) => call[0] === compact && call[2]?.onExhausted
    );
    await recovery![2].onExhausted();
    await flush();
    expect(state.saveCompact).toHaveBeenCalledWith({ mode: 'main' });
  });

  it('uses an existing compact window on repeated switches', async () => {
    process.env.ONDA_COMPACT = '1';
    await boot();
    const compact = state.compactCreated[0];
    state.audioPip.init.mockClear();

    await state.ipcHandlers['app:setWindowMode']({}, 'main');
    await flush();
    await state.ipcHandlers['app:setWindowMode']({}, 'compact');
    await flush();

    expect(compact.show).toHaveBeenCalled();
    expect(compact.focus).toHaveBeenCalled();
    expect(state.compactCreated).toHaveLength(1);
  });

  it('completes the session handoff via IPC or timeout', async () => {
    await boot();
    const main = state.created[0];
    main.webContents.send.mockClear();

    const promise = state.ipcHandlers['app:setWindowMode']({}, 'compact');
    await flush();
    expect(main.webContents.send).toHaveBeenCalledWith('app:prepare-session-handoff');
    state.ipcOnce['app:session-handoff-ready']?.();
    await vi.advanceTimersByTimeAsync(400);
    await promise;
    await flush();
    expect(state.relaunch).toHaveBeenCalled();

    state.relaunch.mockClear();
    const second = state.ipcHandlers['app:setWindowMode']({}, 'compact');
    await vi.advanceTimersByTimeAsync(400);
    await second;
    expect(state.relaunch).toHaveBeenCalled();
  });

  it('ignores invalid or unchanged modes', async () => {
    await boot();
    const count = state.created.length;
    await state.ipcHandlers['app:setWindowMode']({}, 'main');
    await state.ipcHandlers['app:setWindowMode']({}, 'nope');
    expect(state.created.length).toBe(count);
    expect(state.saveCompact).not.toHaveBeenCalled();
  });
});

describe('close to tray', () => {
  it('does not hide when the close decision says no', async () => {
    await boot();
    const win = state.created[0];

    state.shouldHide.mockReturnValue(false);
    const event = { preventDefault: vi.fn() };
    win.handlers['close'](event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });
});
