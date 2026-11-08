import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  app: null as any,
  pinia: { id: 'pinia' },
  router: { id: 'router' },
  i18n: { global: { t: vi.fn((key: string) => key) } },
  initI18n: vi.fn(),
  settingsLoad: vi.fn(),
  pluginsLoad: vi.fn(),
  usePluginsHooks: vi.fn(),
  ensureMediaServerUrl: vi.fn(),
  setCoreShellMode: vi.fn(),
  setPrefetchedToolContext: vi.fn(),
  register: vi.fn(),
  initAll: vi.fn(),
  moduleSpies: {
    player: vi.fn(),
    explorer: vi.fn(),
    library: vi.fn(),
    online: vi.fn(),
    home: vi.fn(),
    settings: vi.fn(),
    sources: vi.fn(),
    tools: vi.fn()
  },
  notify: vi.fn(),
  uiThrows: false,
  invoke: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  directive: vi.fn(),
  idleCallback: null as any,
  rejectionHandlers: [] as Array<(event: any) => void>
}));

vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue')>()),
  createApp: () => state.app
}));
vi.mock('pinia', () => ({
  createPinia: () => state.pinia,
  setActivePinia: vi.fn()
}));
vi.mock('../router', () => ({ default: state.router }));
vi.mock('../App.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ setup: () => () => h('div') }) };
});
vi.mock('../assets/main.css', () => ({}));
vi.mock('../i18n', () => ({ i18n: state.i18n, initI18n: state.initI18n }));
vi.mock('../stores/ui', () => ({
  useUIStore: () => {
    if (state.uiThrows) throw new Error('no ui');
    return { notify: state.notify };
  }
}));
vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({ load: state.settingsLoad })
}));
vi.mock('../stores/plugins', () => ({
  usePluginsStore: () => ({ load: state.pluginsLoad })
}));
vi.mock('../composables/usePluginsHooks', () => ({
  usePluginsHooks: state.usePluginsHooks
}));
vi.mock('../utils/mediaUrl', () => ({
  ensureMediaServerUrl: state.ensureMediaServerUrl
}));
vi.mock('../utils/runtimeMode', () => ({ setCoreShellMode: state.setCoreShellMode }));
vi.mock('../composables/useToolBridge', () => ({
  setPrefetchedToolContext: state.setPrefetchedToolContext
}));
vi.mock('../utils/activateDirective', () => ({ vActivate: state.directive }));
vi.mock('@shared/logger', () => ({
  logger: {
    error: state.loggerError,
    warn: state.loggerWarn,
    info: vi.fn()
  }
}));
vi.mock('../modules/ModuleManager', () => ({
  moduleManager: { register: state.register, initAll: state.initAll }
}));
vi.mock('../modules/PlayerModule', () => ({
  PlayerModule: class {
    constructor() {
      state.moduleSpies.player();
    }
  }
}));
vi.mock('../modules/ExplorerModule', () => ({
  ExplorerModule: class {
    constructor() {
      state.moduleSpies.explorer();
    }
  }
}));
vi.mock('../modules/LibraryModule', () => ({
  LibraryModule: class {
    constructor() {
      state.moduleSpies.library();
    }
  }
}));
vi.mock('../modules/OnlineModule', () => ({
  OnlineModule: class {
    constructor() {
      state.moduleSpies.online();
    }
  }
}));
vi.mock('../modules/HomeModule', () => ({
  HomeModule: class {
    constructor() {
      state.moduleSpies.home();
    }
  }
}));
vi.mock('../modules/SettingsModule', () => ({
  SettingsModule: class {
    constructor() {
      state.moduleSpies.settings();
    }
  }
}));
vi.mock('../modules/SourcesModule', () => ({
  SourcesModule: class {
    constructor() {
      state.moduleSpies.sources();
    }
  }
}));
vi.mock('../modules/ToolsModule', () => ({
  ToolsModule: class {
    constructor() {
      state.moduleSpies.tools();
    }
  }
}));
vi.mock('@renderer/views/LibraryView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ setup: () => () => h('div') }) };
});
vi.mock('@renderer/views/OnlineView.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ setup: () => () => h('div') }) };
});

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

async function loadMain() {
  vi.resetModules();
  await import('../main');
  await flush();
}

beforeEach(() => {
  state.app = {
    use: vi.fn(),
    directive: vi.fn(),
    mount: vi.fn(),
    config: {} as any
  };
  state.initI18n.mockReset();
  state.initI18n.mockResolvedValue(undefined);
  state.settingsLoad.mockReset();
  state.settingsLoad.mockResolvedValue(undefined);
  state.pluginsLoad.mockReset();
  state.pluginsLoad.mockResolvedValue(undefined);
  state.usePluginsHooks.mockReset();
  state.ensureMediaServerUrl.mockReset();
  state.ensureMediaServerUrl.mockResolvedValue(undefined);
  state.setCoreShellMode.mockReset();
  state.setPrefetchedToolContext.mockReset();
  state.register.mockReset();
  state.initAll.mockReset();
  state.initAll.mockResolvedValue(undefined);
  for (const spy of Object.values(state.moduleSpies)) spy.mockReset();
  state.notify.mockReset();
  state.uiThrows = false;
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(false);
  state.loggerError.mockReset();
  state.loggerWarn.mockReset();
  state.directive.mockReset();
  state.idleCallback = null;
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((callback: () => void) => {
      state.idleCallback = callback;
      return 1;
    })
  );
  state.rejectionHandlers = [];
  const originalAdd = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(
    (type: string, handler: any, options?: any) => {
      if (type === 'unhandledrejection') state.rejectionHandlers.push(handler);
      else originalAdd(type, handler, options);
    }
  );
  (window as { api?: unknown }).api = { invoke: state.invoke };
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('app setup', () => {
  it('creates the app, registers modules and plugins', async () => {
    await loadMain();
    expect(state.register).toHaveBeenCalledTimes(8);
    expect(Object.values(state.moduleSpies).every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(state.app.use).toHaveBeenCalledWith(state.pinia);
    expect(state.app.use).toHaveBeenCalledWith(state.router);
    expect(state.app.use).toHaveBeenCalledWith(state.i18n);
    expect(state.app.directive).toHaveBeenCalledWith('activate', state.directive);
    expect(typeof state.app.config.errorHandler).toBe('function');
  });

  it('initialises services and mounts the app', async () => {
    state.invoke.mockImplementation(async (channel: string) =>
      channel === 'app:isCoreShell' ? true : undefined
    );
    await loadMain();

    expect(state.invoke).toHaveBeenCalledWith('app:isCoreShell');
    expect(state.setCoreShellMode).toHaveBeenCalledWith(true);
    expect(state.initI18n).toHaveBeenCalled();
    expect(state.initAll).toHaveBeenCalled();
    expect(state.settingsLoad).toHaveBeenCalled();
    expect(state.ensureMediaServerUrl).toHaveBeenCalled();
    expect(state.app.mount).toHaveBeenCalledWith('#app');
    expect(state.usePluginsHooks).toHaveBeenCalled();
    expect(state.pluginsLoad).toHaveBeenCalled();
    expect(window.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 4000
    });
  });

  it('falls back to non-core mode when the probe fails', async () => {
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await loadMain();
    expect(state.setCoreShellMode).toHaveBeenCalledWith(false);
    expect(state.app.mount).toHaveBeenCalledWith('#app');
  });
});

describe('tool context', () => {
  it('prefetches the tool context for tool windows', async () => {
    window.history.replaceState(null, '', '#/tools/video-clipper');
    const context = { files: ['C:/a.mp4'] };
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'app:isCoreShell') return false;
      if (channel === 'tools:getContext') return context;
      return undefined;
    });
    await loadMain();
    expect(state.invoke).toHaveBeenCalledWith('tools:getContext');
    expect(state.setPrefetchedToolContext).toHaveBeenCalledWith(context);
  });

  it('clears the tool context when loading fails', async () => {
    window.history.replaceState(null, '', '#/tools/video-clipper');
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'app:isCoreShell') return false;
      if (channel === 'tools:getContext') throw new Error('ipc');
      return undefined;
    });
    await loadMain();
    expect(state.setPrefetchedToolContext).toHaveBeenCalledWith(null);
  });

  it('does not request context outside tool windows', async () => {
    await loadMain();
    expect(state.invoke).not.toHaveBeenCalledWith('tools:getContext');
    expect(state.setPrefetchedToolContext).not.toHaveBeenCalled();
  });
});

describe('error reporting', () => {
  it('reports render errors through the logger and UI', async () => {
    await loadMain();
    state.app.config.errorHandler(new Error('boom'), null, 'render');

    expect(state.loggerError).toHaveBeenCalledWith('Error', 'Error: boom', 'render');
    expect(state.notify).toHaveBeenCalledWith('error', 'app.error', 'boom');
  });

  it('handles non-Error values and unavailable UI', async () => {
    await loadMain();
    state.uiThrows = true;
    expect(() => state.app.config.errorHandler('plain', null, 'setup')).not.toThrow();
    expect(state.loggerError).toHaveBeenCalledWith('Error', 'plain', 'setup');
  });

  it('mounts with defaults when bootstrap fails', async () => {
    state.initAll.mockRejectedValueOnce(new Error('module failed'));
    await loadMain();

    expect(state.loggerError).toHaveBeenCalledWith(
      'Error',
      'Error: module failed',
      'bootstrap failed; mounting with defaults'
    );
    expect(state.notify).toHaveBeenCalledWith('error', 'app.error', 'module failed');
    expect(state.app.mount).toHaveBeenCalledWith('#app');
    expect(state.usePluginsHooks).not.toHaveBeenCalled();
  });

  it('tolerates a failing fallback mount', async () => {
    state.initAll.mockRejectedValueOnce(new Error('module failed'));
    state.app.mount.mockImplementation(() => {
      throw new Error('mount failed');
    });
    await loadMain();
    expect(state.app.mount).toHaveBeenCalled();
  });
});

describe('unhandled rejections', () => {
  function emitRejection(reason: unknown): void {
    state.rejectionHandlers.at(-1)!({ reason });
  }

  it('logs and notifies once, throttling repeats', async () => {
    await loadMain();
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    emitRejection(new Error('lost promise'));
    expect(state.loggerError).toHaveBeenCalledWith('Error', 'unhandledrejection: lost promise');
    expect(state.notify).toHaveBeenCalledWith('error', 'app.error', 'lost promise');

    emitRejection(new Error('lost promise'));
    expect(state.notify).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, 'now').mockReturnValue(now + 11_000);
    emitRejection(new Error('lost promise'));
    expect(state.notify).toHaveBeenCalledTimes(2);
  });

  it('stringifies non-Error rejections and tolerates missing UI', async () => {
    await loadMain();
    state.uiThrows = true;
    expect(() => emitRejection('plain reason')).not.toThrow();
    expect(state.loggerError).toHaveBeenCalledWith('Error', 'unhandledrejection: plain reason');
  });
});

describe('prefetching', () => {
  it('falls back to a timer when requestIdleCallback is unavailable', async () => {
    vi.useFakeTimers();
    delete (window as any).requestIdleCallback;
    await loadMain();
    expect(state.app.mount).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2500);
    expect(state.loggerWarn).not.toHaveBeenCalled();
  });
});
