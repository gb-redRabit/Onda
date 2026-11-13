import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';

// Worker lifecycle: manifest/entry resolution, command registration with shortcut
// validation, and deterministic teardown of workers and commands.

const h = vi.hoisted(() => ({
  createPluginWorker: vi.fn()
}));

vi.mock('../pluginWorker', () => ({ createPluginWorker: h.createPluginWorker }));

import { createPluginSpawner, type PluginSpawnerDeps } from '../pluginSpawner';
import type { PluginWorkerHandle, PluginWorkerOptions } from '../pluginWorker';
import type { PluginCommandEntry } from '../pluginShim';

function fakeHandle() {
  return { postHook: vi.fn(), postInvokeCommand: vi.fn(), terminate: vi.fn() };
}

function setup(overrides: Partial<PluginSpawnerDeps> = {}) {
  const deps: PluginSpawnerDeps = {
    commands: ref([]),
    workers: shallowRef({}),
    readyWorkers: new Set<string>(),
    logPush: vi.fn(),
    setStatus: vi.fn(),
    onReady: vi.fn(),
    getManifest: vi.fn(),
    setManifest: vi.fn(),
    clearPluginState: vi.fn(),
    dispatchApi: vi.fn(async () => 'api-result'),
    ...overrides
  };
  const spawner = createPluginSpawner(deps);
  return { deps, spawner };
}

function lastWorkerOptions(): PluginWorkerOptions {
  return h.createPluginWorker.mock.calls.at(-1)![0] as PluginWorkerOptions;
}

const api = window as unknown as { api: { pluginsGet: ReturnType<typeof vi.fn> } };

beforeEach(() => {
  h.createPluginWorker.mockReset().mockImplementation(() => fakeHandle());
  api.api = { pluginsGet: vi.fn() };
});

describe('spawnPlugin', () => {
  it('resolves a missing manifest, caches it and spawns the worker', async () => {
    const manifest = { id: 'p1', name: 'Plugin', version: '1.0.0' } as never;
    api.api.pluginsGet.mockResolvedValue({ success: true, manifest, code: 'code' });
    const { deps, spawner } = setup();

    await spawner.spawnPlugin('p1');

    expect(api.api.pluginsGet).toHaveBeenCalledWith('p1');
    expect(deps.setManifest).toHaveBeenCalledWith('p1', manifest);
    expect(deps.setStatus).toHaveBeenCalledWith('p1', 'loading');
    expect(h.createPluginWorker).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', code: 'code' })
    );
    expect(deps.workers.value.p1).toBeDefined();
  });

  it('reports a missing manifest with the IPC error reason', async () => {
    api.api.pluginsGet.mockResolvedValue({ success: false, error: 'disk-error' });
    const { deps, spawner } = setup();

    await spawner.spawnPlugin('p1');

    expect(deps.setStatus).toHaveBeenCalledWith('p1', 'error', 'disk-error');
    expect(h.createPluginWorker).not.toHaveBeenCalled();
  });

  it('falls back to manifest-missing when the response has no details', async () => {
    api.api.pluginsGet.mockResolvedValue({ success: true });
    const { deps, spawner } = setup();

    await spawner.spawnPlugin('p1');

    expect(deps.setStatus).toHaveBeenCalledWith('p1', 'error', 'manifest-missing');
  });

  it('spawns a cached manifest and defaults a missing entry to entry-missing', async () => {
    api.api.pluginsGet.mockResolvedValue({ success: false });
    const { deps, spawner } = setup({
      getManifest: vi.fn(() => ({ id: 'p1' }) as never)
    });

    await spawner.spawnPlugin('p1');

    expect(deps.setStatus).toHaveBeenCalledWith('p1', 'error', 'entry-missing');
    expect(h.createPluginWorker).not.toHaveBeenCalled();
  });

  it('does not create a second worker for an already running plugin', async () => {
    api.api.pluginsGet.mockResolvedValue({ success: true, code: 'code' });
    const { deps, spawner } = setup({ getManifest: vi.fn(() => ({ id: 'p1' }) as never) });

    await spawner.spawnPlugin('p1');
    await spawner.spawnPlugin('p1');

    expect(h.createPluginWorker).toHaveBeenCalledTimes(1);
    expect(deps.setStatus).toHaveBeenCalledTimes(1);
  });
});

describe('worker callbacks', () => {
  async function spawnWithCode(id = 'p1') {
    api.api.pluginsGet.mockResolvedValue({ success: true, code: 'code' });
    const context = setup({ getManifest: vi.fn(() => ({ id }) as never) });
    await context.spawner.spawnPlugin(id);
    return context;
  }

  it('marks the plugin loaded when the worker becomes ready', async () => {
    const { deps } = await spawnWithCode();

    lastWorkerOptions().onReady();

    expect(deps.readyWorkers.has('p1')).toBe(true);
    expect(deps.setStatus).toHaveBeenCalledWith('p1', 'loaded');
    expect(deps.onReady).toHaveBeenCalledWith('p1');
  });

  it('registers a command with its owning plugin id', async () => {
    const { deps } = await spawnWithCode();

    lastWorkerOptions().onCommand({ id: 'c1', label: 'Play', shortcut: 'Ctrl+K' });

    expect(deps.commands.value).toEqual([
      { id: 'c1', label: 'Play', shortcut: 'Ctrl+K', pluginId: 'p1' }
    ]);
  });

  it('drops invalid commands and re-registrations', async () => {
    const { deps } = await spawnWithCode();

    lastWorkerOptions().onCommand({ id: 'c1', label: 'Play' });
    lastWorkerOptions().onCommand({ id: 'c1', label: 'Play again' });
    lastWorkerOptions().onCommand(null as never);
    lastWorkerOptions().onCommand({ label: 'No id' } as never);

    expect(deps.commands.value).toEqual([{ id: 'c1', label: 'Play', pluginId: 'p1' }]);
  });

  it('rejects commands whose shortcut has an invalid format', async () => {
    const { deps } = await spawnWithCode();

    lastWorkerOptions().onCommand({ id: 'c1', label: 'Play', shortcut: 'K' });

    expect(deps.commands.value[0]!.shortcut).toBeUndefined();
    expect(deps.logPush).toHaveBeenCalledWith(
      'p1',
      expect.stringContaining("shortcut 'K' odrzucony")
    );
  });

  it('drops shortcuts that another command already uses', async () => {
    api.api.pluginsGet.mockResolvedValue({ success: true, code: 'code' });
    const { deps, spawner } = setup({
      getManifest: vi.fn(() => ({ id: 'p1' }) as never),
      commands: ref([{ id: 'other', label: 'Other', shortcut: 'Ctrl+K', pluginId: 'p2' } as never])
    });
    await spawner.spawnPlugin('p1');

    lastWorkerOptions().onCommand({ id: 'c1', label: 'Play', shortcut: 'Ctrl+K' });

    expect(deps.commands.value.at(-1)).toEqual({ id: 'c1', label: 'Play', pluginId: 'p1' });
    expect(deps.logPush).toHaveBeenCalledWith(
      'p1',
      expect.stringContaining("shortcut 'Ctrl+K' pominięty")
    );
  });

  it('unregisters only commands owned by the plugin', async () => {
    const { deps } = await spawnWithCode();

    lastWorkerOptions().onCommand({ id: 'c1', label: 'Play' });
    lastWorkerOptions().onCommand({ id: 'c2', label: 'Stop' });
    deps.commands.value.push({ id: 'other', label: 'Other', pluginId: 'p2' } as never);
    lastWorkerOptions().onCommandRemoved('c1');

    expect(deps.commands.value.map((c) => c.id)).toEqual(['c2', 'other']);
  });

  it('forwards log, error and api messages', async () => {
    const { deps } = await spawnWithCode();

    lastWorkerOptions().onLog('warn', 'careful');
    lastWorkerOptions().onError('boom');
    await expect(lastWorkerOptions().apiDispatch('library:list', [1])).resolves.toBe('api-result');

    expect(deps.logPush).toHaveBeenCalledWith('p1', '[warn] careful');
    expect(deps.logPush).toHaveBeenCalledWith('p1', '[error] boom');
    expect(deps.setStatus).toHaveBeenCalledWith('p1', 'error', 'boom');
    expect(deps.dispatchApi).toHaveBeenCalledWith('library:list', [1], 'p1');
  });
});

describe('teardown', () => {
  it('terminates a single worker and clears its commands and state', () => {
    const handle = fakeHandle();
    const commands = ref([{ id: 'c1', label: 'Play', pluginId: 'p1' }]);
    const { deps, spawner } = setup({
      commands,
      workers: shallowRef<Record<string, PluginWorkerHandle>>({ p1: handle, p2: fakeHandle() })
    });
    deps.readyWorkers.add('p1');
    deps.readyWorkers.add('p2');

    spawner.terminatePlugin('p1', true);

    expect(handle.terminate).toHaveBeenCalledTimes(1);
    expect(Object.keys(deps.workers.value)).toEqual(['p2']);
    expect(deps.readyWorkers.has('p1')).toBe(false);
    expect(commands.value).toEqual([]);
    expect(deps.clearPluginState).toHaveBeenCalledWith('p1');
  });

  it('keeps other plugin commands when requested', () => {
    const commands = ref<PluginCommandEntry[]>([
      { id: 'c1', label: 'Play', pluginId: 'p1' } as unknown as PluginCommandEntry,
      { id: 'c2', label: 'Other', pluginId: 'p2' } as unknown as PluginCommandEntry
    ]);
    const { deps, spawner } = setup({ commands });

    spawner.terminatePlugin('p1', false);

    expect(commands.value.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(deps.clearPluginState).toHaveBeenCalledWith('p1');
  });

  it('tolerates terminating an unknown plugin', () => {
    const { deps, spawner } = setup();

    expect(() => spawner.terminatePlugin('missing', true)).not.toThrow();
    expect(deps.clearPluginState).toHaveBeenCalledWith('missing');
  });

  it('terminates every worker even when one throws', () => {
    const ok = fakeHandle();
    const broken = fakeHandle();
    broken.terminate.mockImplementation(() => {
      throw new Error('already gone');
    });
    const { deps, spawner } = setup({
      workers: shallowRef<Record<string, PluginWorkerHandle>>({ a: broken, b: ok })
    });

    spawner.terminateAll();

    expect(broken.terminate).toHaveBeenCalledTimes(1);
    expect(ok.terminate).toHaveBeenCalledTimes(1);
    expect(deps.workers.value).toEqual({});
  });
});
