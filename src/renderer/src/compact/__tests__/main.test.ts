import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  app: null as any,
  createApp: vi.fn(),
  createPinia: vi.fn(() => ({ id: 'pinia' })),
  setActivePinia: vi.fn(),
  storeToRefs: vi.fn(),
  initI18n: vi.fn(async () => undefined),
  loadLocaleMessages: vi.fn(async () => undefined),
  settings: null as any,
  settingsLoad: vi.fn(async () => undefined),
  libraryLoad: vi.fn(async () => undefined),
  theme: { applyTheme: vi.fn(async () => undefined), dispose: vi.fn() },
  restoreSession: vi.fn(async () => true),
  ensureMedia: vi.fn(async () => undefined),
  setCoreShellMode: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return { ...actual, createApp: h.createApp, nextTick: () => Promise.resolve() };
});
vi.mock('pinia', () => ({
  createPinia: h.createPinia,
  setActivePinia: h.setActivePinia,
  storeToRefs: h.storeToRefs
}));
vi.mock('../App.vue', () => ({ default: { name: 'CompactApp' } }));
vi.mock('@renderer/i18n', () => ({
  i18n: { global: {} },
  initI18n: h.initI18n,
  loadLocaleMessages: h.loadLocaleMessages
}));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/stores/library', () => ({
  useLibraryStore: () => ({ loadFromDisk: h.libraryLoad })
}));
vi.mock('@renderer/composables/useTheme', () => ({ getThemeEngine: () => h.theme }));
vi.mock('@renderer/composables/useSessionPersistence', () => ({
  restoreSessionToPlayer: h.restoreSession
}));
vi.mock('@renderer/utils/mediaUrl', () => ({ ensureMediaServerUrl: h.ensureMedia }));
vi.mock('@renderer/utils/runtimeMode', () => ({ setCoreShellMode: h.setCoreShellMode }));
vi.mock('@shared/logger', () => ({
  logger: { error: h.loggerError, warn: h.loggerWarn, info: h.loggerInfo }
}));

async function load() {
  vi.resetModules();
  await import('../main');
  await flush();
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.app = {
    config: {} as { errorHandler?: (...args: unknown[]) => void },
    use: vi.fn(),
    mount: vi.fn()
  };
  h.createApp.mockReturnValue(h.app);
  h.settings = {
    appearance: { locale: 'pl', theme: 'dark' },
    general: { restoreSession: false },
    load: h.settingsLoad
  };
  h.storeToRefs.mockReturnValue({ appearance: ref({ locale: 'pl', theme: 'dark' }) });
  h.invoke.mockReset();
  h.invoke.mockResolvedValue(false);
  (window as unknown as { api?: unknown }).api = { invoke: h.invoke };
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { api?: unknown }).api;
});

describe('compact boot', () => {
  it('boots the compact shell and mounts the app', async () => {
    await load();

    expect(h.setCoreShellMode).toHaveBeenCalledWith(true);
    expect(h.createPinia).toHaveBeenCalled();
    expect(h.setActivePinia).toHaveBeenCalled();
    expect(h.app.use).toHaveBeenCalledWith({ id: 'pinia' });
    expect(h.initI18n).toHaveBeenCalled();
    expect(h.settingsLoad).toHaveBeenCalled();
    expect(h.ensureMedia).toHaveBeenCalled();
    expect(h.loadLocaleMessages).toHaveBeenCalledWith('pl');
    expect(h.theme.applyTheme).toHaveBeenCalled();
    expect(h.app.mount).toHaveBeenCalledWith('#app');
    expect(h.invoke).toHaveBeenCalledWith('app:rendererReady');
    expect(h.libraryLoad).toHaveBeenCalledWith({ audioOnly: true });
    expect(h.loggerInfo).not.toHaveBeenCalled();
  });

  it('restores the session when requested by main', async () => {
    h.invoke.mockResolvedValue(true);
    await load();

    expect(h.restoreSession).toHaveBeenCalled();
    expect(h.loggerInfo).toHaveBeenCalledWith('compact', 'session restore: ok');
  });

  it('restores from settings without a one-shot flag', async () => {
    h.settings.general.restoreSession = true;
    h.restoreSession.mockResolvedValueOnce(false);
    await load();

    expect(h.restoreSession).toHaveBeenCalled();
    expect(h.loggerInfo).toHaveBeenCalledWith('compact', 'session restore: none');
  });

  it('falls back to defaults and still mounts', async () => {
    h.initI18n.mockRejectedValueOnce(new Error('i18n'));
    await load();

    expect(h.loggerWarn).toHaveBeenCalledWith('compact', 'boot with defaults', expect.any(Error));
    expect(h.app.mount).toHaveBeenCalledWith('#app');
  });

  it('logs renderer errors through the global handler', async () => {
    await load();

    h.app.config.errorHandler!(new Error('boom'), null, 'render');
    expect(h.loggerError).toHaveBeenCalledWith('compact', 'renderer error: Error: boom', 'render');
  });

  it('ignores a rejected rendererReady call', async () => {
    h.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'app:rendererReady') throw new Error('not ready');
      return false;
    });

    await expect(load()).resolves.toBeUndefined();
    expect(h.app.mount).toHaveBeenCalled();
  });

  it('disposes the theme when the window unloads', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    await load();

    const call = addEventListener.mock.calls.find(([event]) => event === 'beforeunload')!;
    expect(call).toBeDefined();
    (call[1] as () => void)();
    addEventListener.mockRestore();

    expect(h.theme.dispose).toHaveBeenCalled();
  });

  it('tolerates a missing preload bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    await load();

    expect(h.app.mount).toHaveBeenCalled();
    expect(h.restoreSession).not.toHaveBeenCalled();
  });
});
