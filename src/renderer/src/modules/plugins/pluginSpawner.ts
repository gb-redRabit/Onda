import type { Ref, ShallowRef } from 'vue';
import type { PluginManifest } from '@shared/types/ipc';
import type { PluginCommandEntry } from './plugin-shim';
import { createPluginWorker, type PluginWorkerHandle } from './pluginWorker';
import { omitKey, validateShortcut } from '@renderer/utils/plugins-helpers';

export type PluginUiStatus = 'new' | 'loading' | 'loaded' | 'error';

export interface PluginSpawnerDeps {
  commands: Ref<PluginCommandEntry[]>;
  workers: ShallowRef<Record<string, PluginWorkerHandle>>;
  readyWorkers: Set<string>;
  logPush: (id: string, line: string) => void;
  setStatus: (id: string, status: PluginUiStatus, error?: string) => void;
  getManifest: (id: string) => PluginManifest | undefined;
  setManifest: (id: string, manifest: PluginManifest) => void;
  clearPluginState: (id: string) => void;
  dispatchApi: (op: string, args: unknown[], pluginId: string) => Promise<unknown>;
}

export interface PluginSpawner {
  spawnPlugin: (id: string) => Promise<void>;
  terminatePlugin: (id: string, removeCommands: boolean) => void;
  terminateAll: () => void;
}

/**
 * Worker lifecycle for plugins: resolves manifest/entry via IPC, creates the
 * worker, wires its command/log/api callbacks and tears it down again. Owned by
 * `stores/plugins.ts`, which supplies the reactive refs and UI callbacks.
 */
export function createPluginSpawner(deps: PluginSpawnerDeps): PluginSpawner {
  const {
    commands,
    workers,
    readyWorkers,
    logPush,
    setStatus,
    getManifest,
    setManifest,
    clearPluginState,
    dispatchApi
  } = deps;

  function shortcutTakenBy(shortcut: string): string | null {
    return commands.value.find((c) => c.shortcut === shortcut)?.id ?? null;
  }

  function spawnPluginWithCode(id: string, code: string): void {
    if (workers.value[id]) return;
    setStatus(id, 'loading');
    const pluginId = id;
    const handle = createPluginWorker({
      id,
      code,
      onReady() {
        readyWorkers.add(pluginId);
        setStatus(pluginId, 'loaded');
      },
      onCommand(command) {
        if (!command || typeof command.id !== 'string') return;
        if (
          !commands.value.some(
            (c) => c.id === command.id && (c as { pluginId?: string }).pluginId === pluginId
          )
        ) {
          let next = { ...command, pluginId } as PluginCommandEntry & { pluginId: string };
          if (command.shortcut && !validateShortcut(command.shortcut)) {
            logPush(
              pluginId,
              `[warn] shortcut '${command.shortcut}' odrzucony (nieprawidłowy format)`
            );
            next = { ...next, shortcut: undefined };
          } else if (command.shortcut && shortcutTakenBy(command.shortcut)) {
            logPush(
              pluginId,
              `[warn] shortcut '${command.shortcut}' pominięty (konflikt z inną komendą)`
            );
            next = { ...next, shortcut: undefined };
          }
          commands.value.push(next);
        }
      },
      onCommandRemoved(commandId) {
        commands.value = commands.value.filter(
          (c) => !(c.id === commandId && (c as { pluginId?: string }).pluginId === pluginId)
        );
      },
      onLog(level, message) {
        logPush(pluginId, `[${level}] ${message}`);
      },
      onError(message) {
        logPush(pluginId, `[error] ${message}`);
        setStatus(pluginId, 'error', message);
      },
      async apiDispatch(op, args) {
        return dispatchApi(op, args, pluginId);
      }
    });
    workers.value = { ...workers.value, [id]: handle };
  }

  async function spawnPlugin(id: string): Promise<void> {
    const manifest = getManifest(id);
    if (!manifest) {
      const result = await window.api.pluginsGet(id);
      if (!result.success || !result.manifest || !result.code) {
        setStatus(id, 'error', result.error || 'manifest-missing');
        return;
      }
      setManifest(id, result.manifest);
      spawnPluginWithCode(id, result.code);
      return;
    }
    const result = await window.api.pluginsGet(id);
    if (!result.success || !result.code) {
      setStatus(id, 'error', result.error || 'entry-missing');
      return;
    }
    spawnPluginWithCode(id, result.code);
  }

  function terminatePlugin(id: string, removeCommands: boolean): void {
    const handle = workers.value[id];
    if (handle) {
      handle.terminate();
      workers.value = omitKey(workers.value, id);
    }
    readyWorkers.delete(id);
    if (removeCommands) {
      commands.value = commands.value.filter((c) => (c as { pluginId?: string }).pluginId !== id);
    }
    clearPluginState(id);
  }

  function terminateAll(): void {
    for (const handle of Object.values(workers.value)) {
      try {
        handle.terminate();
      } catch {
        /* ignore */
      }
    }
    workers.value = {};
  }

  return { spawnPlugin, terminatePlugin, terminateAll };
}
