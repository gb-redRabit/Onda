import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

const h = vi.hoisted(() => ({
  spawner: {
    spawnPlugin: vi.fn(async () => {}),
    terminatePlugin: vi.fn(),
    terminateAll: vi.fn()
  },
  deps: null as null | Record<string, (...args: never[]) => unknown>,
  dispatchApi: vi.fn(async () => 'api'),
  emitHook: vi.fn(),
  commandsIn: vi.fn(() => []),
  dispatchShortcut: vi.fn(),
  dispatchCommand: vi.fn(),
  invokeCommandWithContext: vi.fn(),
  logPush: vi.fn(),
  settingsOf: vi.fn(() => ({})),
  saveSetting: vi.fn(async () => true),
  settingFields: vi.fn(() => []),
  computeDecorations: vi.fn(() => ({ cover: 'none' })),
  computeLayoutVariants: vi.fn(() => ({})),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('@renderer/modules/plugins/pluginSpawner', () => ({
  createPluginSpawner: (deps: Record<string, (...args: never[]) => unknown>) => {
    h.deps = deps;
    return h.spawner;
  }
}));
vi.mock('@renderer/modules/plugins/pluginApi', () => ({
  createPluginApi: () => h.dispatchApi
}));
vi.mock('@renderer/modules/plugins/pluginCommands', () => ({
  createPluginCommands: () => ({
    emitHook: h.emitHook,
    commandsIn: h.commandsIn,
    dispatchShortcut: h.dispatchShortcut,
    dispatchCommand: h.dispatchCommand,
    invokeCommandWithContext: h.invokeCommandWithContext
  })
}));
vi.mock('@renderer/modules/plugins/pluginSettings', () => ({
  createPluginSettings: () => ({
    settingsOf: h.settingsOf,
    saveSetting: h.saveSetting,
    settingFields: h.settingFields
  })
}));
vi.mock('@renderer/modules/plugins/pluginLogs', () => ({
  createPluginLogs: () => ({ logPush: h.logPush })
}));
vi.mock('@renderer/utils/plugins-derive', () => ({
  computeDecorations: h.computeDecorations,
  computeLayoutVariants: h.computeLayoutVariants
}));
vi.mock('@shared/logger', () => ({
  logger: { warn: h.warn, error: h.error, info: vi.fn(), debug: vi.fn() }
}));

import { usePluginsStore } from '../plugins';

type Api = Record<string, ReturnType<typeof vi.fn>>;

function plugin(over: Record<string, unknown> = {}) {
  return { id: 'p1', enabled: false, name: 'P1', ...over };
}

function installApi(over: Record<string, unknown> = {}): Api {
  const api: Api = {
    pluginsListExamples: vi.fn(async () => [{ id: 'ex' }]),
    pluginsList: vi.fn(async () => [plugin()]),
    pluginsSettingsGet: vi.fn(async () => ({ volume: 1 })),
    pluginsToggle: vi.fn(async () => true),
    pluginsUninstall: vi.fn(async () => ({ success: true })),
    pluginsInstallFromFolder: vi.fn(async () => ({ success: true, installed: true })),
    pluginsInstallExample: vi.fn(async () => ({ success: true, installed: true })),
    pluginsGet: vi.fn(async () => ({ success: true, consentHash: 'hash' })),
    ...over
  };
  (window as unknown as { api: Api }).api = api;
  return api;
}

function makeStore(api: Api = installApi()) {
  setActivePinia(createPinia());
  return { api, store: usePluginsStore() };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.spawner.spawnPlugin.mockResolvedValue(undefined);
  h.computeDecorations.mockReturnValue({ cover: 'none' });
  h.computeLayoutVariants.mockReturnValue({});
});

// Pinia plugin store: load/toggle/install lifecycle, worker wiring and derived state.

describe('plugins load', () => {
  it('loads examples, plugins and settings and spawns enabled plugins', async () => {
    const api = installApi({ pluginsList: vi.fn(async () => [plugin({ enabled: true })]) });
    const { store } = makeStore(api);

    await store.load();

    expect(api.pluginsListExamples).toHaveBeenCalled();
    expect(api.pluginsList).toHaveBeenCalled();
    expect(api.pluginsSettingsGet).toHaveBeenCalledWith('p1');
    expect(store.plugins).toEqual([expect.objectContaining({ id: 'p1', status: 'new' })]);
    expect(store.pluginSettings.p1).toEqual({ volume: 1 });
    expect(h.spawner.spawnPlugin).toHaveBeenCalledWith('p1');
    expect(store.loading).toBe(false);
  });

  it('shares a single in-flight load and skips repeat loads once loaded', async () => {
    const api = installApi();
    const { store } = makeStore(api);

    const first = store.load();
    const second = store.load();
    await Promise.all([first, second]);
    await store.load();

    expect(api.pluginsList).toHaveBeenCalledTimes(1);
  });

  it('forces a reload with refresh and terminates existing workers first', async () => {
    const { store } = makeStore();
    await store.load();
    (h.deps as unknown as { workers: { value: Record<string, unknown> } }).workers.value = {
      p1: {}
    };
    h.spawner.terminatePlugin.mockClear();

    await store.refresh();

    expect(h.spawner.terminatePlugin).toHaveBeenCalledWith('p1', true);
  });

  it('defaults missing settings and list responses', async () => {
    const api = installApi({
      pluginsList: vi.fn(async () => null),
      pluginsSettingsGet: vi.fn(async () => {
        throw new Error('nope');
      })
    });
    const { store } = makeStore(api);

    await store.load();

    expect(store.plugins).toEqual([]);
  });

  it('logs load failures and resets loading', async () => {
    const api = installApi({
      pluginsList: vi.fn(async () => {
        throw new Error('disk');
      })
    });
    const { store } = makeStore(api);

    await store.load();

    expect(h.error).toHaveBeenCalledWith('plugins', 'plugins.load failed', expect.any(Error));
    expect(store.loading).toBe(false);
  });

  it('keeps examples empty when the example list fails', async () => {
    const api = installApi({
      pluginsListExamples: vi.fn(async () => {
        throw new Error('nope');
      })
    });
    const { store } = makeStore(api);

    await store.load();

    expect(store.examples).toEqual([]);
    expect(h.warn).toHaveBeenCalledWith(
      'plugins',
      'plugins.loadExamples failed',
      expect.any(Error)
    );
  });

  it('defaults missing example lists and settings payloads', async () => {
    const api = installApi({
      pluginsListExamples: vi.fn(async () => null),
      pluginsSettingsGet: vi.fn(async () => null)
    });
    const { store } = makeStore(api);

    await store.load();

    expect(store.examples).toEqual([]);
    expect(store.pluginSettings.p1).toEqual({});
  });

  it('defaults a failing settings read to an empty object', async () => {
    const api = installApi({
      pluginsSettingsGet: vi.fn(async () => {
        throw new Error('locked');
      })
    });
    const { store } = makeStore(api);

    await store.load();

    expect(store.pluginSettings.p1).toEqual({});
    expect(store.plugins).toHaveLength(1);
  });
});

describe('plugin toggles and installs', () => {
  async function loaded() {
    const api = installApi();
    const { store } = makeStore(api);
    await store.load();
    return { api, store };
  }

  it('requires consent and a known plugin to enable', async () => {
    const { store } = await loaded();

    await expect(store.toggle('p1')).resolves.toBe(false);
    await expect(store.toggle('missing', 'hash')).resolves.toBe(false);
  });

  it('enables a plugin after approval and spawns it', async () => {
    const { api, store } = await loaded();

    await expect(store.toggle('p1', 'hash')).resolves.toBe(true);

    expect(api.pluginsToggle).toHaveBeenCalledWith('p1', true, 'hash');
    expect(store.plugins[0]).toMatchObject({
      enabled: true,
      status: 'new',
      permissionReviewRequired: false
    });
    expect(h.spawner.spawnPlugin).toHaveBeenCalledWith('p1');
  });

  it('keeps the plugin disabled when the main process refuses', async () => {
    const { api, store } = await loaded();
    api.pluginsToggle.mockResolvedValueOnce(false);

    await expect(store.toggle('p1', 'hash')).resolves.toBe(false);
    expect(store.plugins[0].enabled).toBe(false);
  });

  it('disables a plugin, terminates the worker and drops its commands', async () => {
    const api = installApi({ pluginsList: vi.fn(async () => [plugin({ enabled: true })]) });
    const { store } = makeStore(api);
    await store.load();

    await expect(store.toggle('p1')).resolves.toBe(true);

    expect(api.pluginsToggle).toHaveBeenCalledWith('p1', false, undefined);
    expect(h.spawner.terminatePlugin).toHaveBeenCalledWith('p1', false);
    expect(store.plugins[0]).toMatchObject({ enabled: false, status: 'new' });
  });

  it('updates only the toggled plugin when several are installed', async () => {
    const api = installApi({
      pluginsList: vi.fn(async () => [plugin(), plugin({ id: 'p2', name: 'P2' })])
    });
    const { store } = makeStore(api);
    await store.load();

    await store.toggle('p1', 'hash');

    expect(store.plugins[0]).toMatchObject({ id: 'p1', enabled: true });
    expect(store.plugins[1]).toMatchObject({ id: 'p2', enabled: false, status: 'new' });
  });

  it('disables only the toggled plugin when several are installed', async () => {
    const api = installApi({
      pluginsList: vi.fn(async () => [
        plugin({ enabled: true }),
        plugin({ id: 'p2', name: 'P2', enabled: true })
      ])
    });
    const { store } = makeStore(api);
    await store.load();

    await store.toggle('p1');

    expect(store.plugins[0]).toMatchObject({ id: 'p1', enabled: false });
    expect(store.plugins[1]).toMatchObject({ id: 'p2', enabled: true });
  });

  it('approves only when the main process returns a consent hash', async () => {
    const { api, store } = await loaded();

    await expect(store.approveAndEnable('missing')).resolves.toBe(false);

    api.pluginsGet.mockResolvedValueOnce({ success: true });
    await expect(store.approveAndEnable('p1')).resolves.toBe(false);

    api.pluginsGet.mockResolvedValueOnce({ success: false, consentHash: 'hash' });
    await expect(store.approveAndEnable('p1')).resolves.toBe(false);

    api.pluginsGet.mockResolvedValueOnce({ success: true, consentHash: 'hash' });
    await expect(store.approveAndEnable('p1')).resolves.toBe(true);
  });

  it('uninstalls successfully and keeps plugins when removal fails', async () => {
    const { api, store } = await loaded();
    api.pluginsUninstall.mockResolvedValueOnce({ success: false });
    await store.uninstall('p1');
    expect(store.plugins).toHaveLength(1);

    api.pluginsUninstall.mockResolvedValueOnce({ success: true });
    await store.uninstall('p1');
    expect(h.spawner.terminatePlugin).toHaveBeenCalledWith('p1', true);
    expect(store.plugins).toEqual([]);
  });

  it('reloads after successful installs only', async () => {
    const { api, store } = await loaded();
    api.pluginsInstallFromFolder.mockResolvedValueOnce({ success: false });
    await store.installFromFolder();
    expect(api.pluginsList).toHaveBeenCalledTimes(1);

    api.pluginsInstallFromFolder.mockResolvedValueOnce({ success: true, installed: false });
    await store.installFromFolder();
    expect(api.pluginsList).toHaveBeenCalledTimes(1);

    api.pluginsInstallExample.mockResolvedValueOnce({ success: true, installed: false });
    await store.installExample('ex');
    expect(api.pluginsList).toHaveBeenCalledTimes(1);

    await store.installFromFolder();
    await store.installExample('ex');
    expect(api.pluginsList).toHaveBeenCalledTimes(3);
  });
});

describe('worker wiring and derived state', () => {
  it('exposes the worker callbacks with store state updates', async () => {
    const { store } = makeStore();
    await store.load();
    const deps = h.deps! as unknown as {
      setStatus: (id: string, status: string, error?: string) => void;
      onReady: (id: string) => void;
      setManifest: (id: string, manifest: unknown) => void;
      clearPluginState: (id: string) => void;
      getManifest: (id: string) => unknown;
    };

    deps.setStatus('p1', 'error', 'boom');
    expect(store.plugins[0]).toMatchObject({ status: 'error', error: 'boom' });

    const postHook = vi.fn();
    (h.deps as unknown as { workers: { value: Record<string, unknown> } }).workers.value = {
      p1: { postHook }
    };
    deps.setManifest('p1', { id: 'p1', hooks: ['app:start'] });
    deps.onReady('p1');
    expect(postHook).toHaveBeenCalledWith('app:start', {});

    store.visuals.p1 = { 'element.decoration': 'circle' };
    store.slots.p1 = { slot: [] };
    store.pluginSettings.p1 = { a: 1 };
    deps.clearPluginState('p1');
    expect(store.visuals.p1).toBeUndefined();
    expect(store.slots.p1).toBeUndefined();
    expect(store.pluginSettings.p1).toBeUndefined();
  });

  it('ignores unknown plugin ids and skips missing hook manifests', async () => {
    const { store } = makeStore();
    await store.load();
    const deps = h.deps! as unknown as {
      setStatus: (id: string, status: string, error?: string) => void;
      onReady: (id: string) => void;
      setManifest: (id: string, manifest: unknown) => void;
      clearPluginState: (id: string) => void;
    };

    deps.setStatus('ghost', 'loaded');
    expect(store.plugins[0]).toMatchObject({ id: 'p1', status: 'new' });

    const postHook = vi.fn();
    (h.deps as unknown as { workers: { value: Record<string, unknown> } }).workers.value = {
      p2: { postHook }
    };
    deps.setManifest('p2', { id: 'p2', hooks: [] });
    deps.onReady('p2');
    deps.onReady('unknown');
    expect(postHook).not.toHaveBeenCalled();

    store.visuals.other = { 'element.decoration': 'circle' };
    deps.clearPluginState('ghost');
    expect(store.visuals.other).toBeDefined();
  });

  it('computes decorations and layout variants from the store state', async () => {
    const { store } = makeStore();
    await store.load();

    expect(store.decorations).toEqual({ cover: 'none' });
    expect(store.layoutVariants).toEqual({});
    expect(h.computeDecorations).toHaveBeenCalled();
    expect(h.computeLayoutVariants).toHaveBeenCalled();
  });

  it('forwards command, hook and settings helpers', async () => {
    const { store } = makeStore();
    await store.load();

    store.emitHook('track:play', {});
    store.dispatchCommand('c');
    store.dispatchShortcut('Ctrl+K');
    store.commandsIn('slot');
    await store.invokeCommandWithContext('c', {});
    await store.dispatchApi('op', [], 'p1');
    await store.saveSetting('p1', 'k', 1);
    store.settingsOf('p1');
    store.settingFields('p1');

    expect(h.emitHook).toHaveBeenCalledWith('track:play', {});
    expect(h.dispatchCommand).toHaveBeenCalledWith('c');
    expect(h.dispatchShortcut).toHaveBeenCalledWith('Ctrl+K');
    expect(h.commandsIn).toHaveBeenCalledWith('slot');
    expect(h.invokeCommandWithContext).toHaveBeenCalledWith('c', {});
    expect(h.dispatchApi).toHaveBeenCalledWith('op', [], 'p1');
    expect(h.saveSetting).toHaveBeenCalledWith('p1', 'k', 1);
    expect(h.settingsOf).toHaveBeenCalledWith('p1');
    expect(h.settingFields).toHaveBeenCalledWith('p1');
  });

  it('terminates every worker on beforeunload', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    makeStore();
    await nextTick();
    const handler = add.mock.calls.find(([name]) => name === 'beforeunload')?.[1] as () => void;

    handler();

    expect(h.spawner.terminateAll).toHaveBeenCalled();
  });
});
