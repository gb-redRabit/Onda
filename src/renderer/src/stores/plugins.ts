import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import type {
  PluginInfo,
  PluginManifest,
  PluginSettingField,
  IpcPluginInstallResult
} from '@shared/types/ipc';
import type { PluginCommandEntry, PluginHookPayload } from '@renderer/modules/plugins/plugin-shim';
import { isKnownHook } from '@renderer/utils/pluginHooks';
import type { PluginWorkerHandle } from '@renderer/modules/plugins/pluginWorker';
import { createPluginSpawner, type PluginUiStatus } from '@renderer/modules/plugins/pluginSpawner';
import { createPluginApi } from '@renderer/modules/plugins/pluginApi';
import { logger } from '@shared/logger';
import {
  ELEMENT_DECORATIONS,
  PLUGIN_HOST_VARIANTS,
  omitKey,
  snapshotTrack
} from '@renderer/utils/plugins-helpers';
export { ELEMENT_DECORATIONS, PLUGIN_HOST_VARIANTS, snapshotTrack };
export type { TrackSnapshot } from '@renderer/utils/plugins-helpers';
export type { PluginUiStatus };
import {
  computeDecorations,
  computeLayoutVariants,
  mergeSettingDefaults
} from '@renderer/utils/plugins-derive';

export interface PluginUiInfo extends PluginInfo {
  status: PluginUiStatus;
  error?: string;
}

const MAX_LOG_LINES = 50;

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<PluginUiInfo[]>([]);
  const commands = ref<PluginCommandEntry[]>([]);
  const logs = ref<Record<string, string[]>>({});
  const loading = ref(false);
  const visuals = ref<Record<string, Record<string, string>>>({});
  const pluginSettings = ref<Record<string, Record<string, unknown>>>({});

  const manifests = ref<Record<string, PluginManifest>>({});
  const workers = shallowRef<Record<string, PluginWorkerHandle>>({});
  const readyWorkers = new Set<string>();

  const decorations = computed(() => computeDecorations(plugins.value, visuals.value));

  const layoutVariants = computed(() => computeLayoutVariants(plugins.value, manifests.value));

  function logPush(id: string, line: string): void {
    let list = logs.value[id];
    if (!list) {
      list = [];
      logs.value = { ...logs.value, [id]: list };
    }
    list.push(line);
    if (list.length > MAX_LOG_LINES) list.splice(0, list.length - MAX_LOG_LINES);
  }

  function setStatus(id: string, status: PluginUiStatus, error?: string): void {
    plugins.value = plugins.value.map((p) => (p.id === id ? { ...p, status, error } : p));
  }

  function manifestOf(id: string): PluginManifest | undefined {
    return manifests.value[id];
  }

  function settingsOf(id: string): Record<string, unknown> {
    const stored = pluginSettings.value[id] || {};
    const fields = manifestOf(id)?.settings || [];
    return mergeSettingDefaults(stored, fields);
  }

  async function saveSetting(id: string, key: string, value: unknown): Promise<boolean> {
    const ok = await window.api.pluginsSettingsSet(id, key, value);
    if (ok) {
      pluginSettings.value = {
        ...pluginSettings.value,
        [id]: { ...(pluginSettings.value[id] || {}), [key]: value }
      };
    }
    return ok;
  }

  function settingFields(id: string): PluginSettingField[] {
    return manifestOf(id)?.settings || [];
  }

  function clearPluginState(id: string): void {
    if (visuals.value[id]) visuals.value = omitKey(visuals.value, id);
    if (pluginSettings.value[id]) pluginSettings.value = omitKey(pluginSettings.value, id);
  }

  const dispatchApi = createPluginApi({
    getManifest: manifestOf,
    getSettings: settingsOf,
    saveSetting,
    visuals
  });

  const spawner = createPluginSpawner({
    commands,
    workers,
    readyWorkers,
    logPush,
    setStatus,
    getManifest: manifestOf,
    setManifest(id, manifest) {
      manifests.value = { ...manifests.value, [id]: manifest };
    },
    clearPluginState,
    dispatchApi
  });

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const list = (await window.api.pluginsList()) || [];
      manifests.value = {};
      workers.value = {};
      readyWorkers.clear();
      commands.value = [];
      visuals.value = {};
      plugins.value = list.map((p) => ({ ...p, status: 'new' as PluginUiStatus }));
      logs.value = {};
      pluginSettings.value = {};
      const fetchedSettings = await Promise.all(
        list.map(async (plugin) => {
          let value: Record<string, unknown> = {};
          try {
            value = (await window.api.pluginsSettingsGet(plugin.id)) || {};
          } catch {
            value = {};
          }
          return [plugin.id, value] as const;
        })
      );
      pluginSettings.value = {};
      for (const [id, value] of fetchedSettings) {
        pluginSettings.value[id] = value;
      }
      for (const plugin of list) {
        if (plugin.enabled) {
          await spawner.spawnPlugin(plugin.id);
        }
      }
      readyWorkers.forEach(() => undefined);
      emitHook('app:start', {});
    } catch (e) {
      logger.error('plugins', 'plugins.load failed', e);
    } finally {
      loading.value = false;
    }
  }

  async function toggle(id: string): Promise<void> {
    const info = plugins.value.find((p) => p.id === id);
    const enabled = info ? !info.enabled : false;
    const ok = await window.api.pluginsToggle(id, enabled);
    if (!ok) return;
    if (enabled) {
      plugins.value = plugins.value.map((p) =>
        p.id === id ? { ...p, enabled: true, status: 'new' } : p
      );
      await spawner.spawnPlugin(id);
    } else {
      spawner.terminatePlugin(id, false);
      plugins.value = plugins.value.map((p) =>
        p.id === id ? { ...p, enabled: false, status: 'new' } : p
      );
    }
  }

  async function uninstall(id: string): Promise<void> {
    const result = await window.api.pluginsUninstall(id);
    if (!result.success) return;
    spawner.terminatePlugin(id, true);
    plugins.value = plugins.value.filter((p) => p.id !== id);
  }

  async function installFromFolder(): Promise<IpcPluginInstallResult> {
    const result = await window.api.pluginsInstallFromFolder();
    if (result.success && result.installed) {
      await load();
    }
    return result;
  }

  async function refresh(): Promise<void> {
    for (const id of Object.keys(workers.value)) spawner.terminatePlugin(id, true);
    await load();
  }

  function emitHook(name: string, payload: PluginHookPayload): void {
    if (!isKnownHook(name)) return;
    const list = Object.entries(workers.value);
    for (const [id, handle] of list) {
      if (!readyWorkers.has(id)) continue;
      try {
        handle.postHook(name, payload);
      } catch (e) {
        logPush(id, `[error] hook ${name} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  function commandsIn(location: string): PluginCommandEntry[] {
    return commands.value.filter((c) => (c as { location?: string }).location === location);
  }

  function findCommandByShortcut(
    shortcut: string
  ): (PluginCommandEntry & { pluginId?: string }) | undefined {
    return commands.value.find((c) => c.shortcut === shortcut);
  }

  function dispatchShortcut(shortcut: string): boolean {
    const cmd = findCommandByShortcut(shortcut);
    if (!cmd) return false;
    dispatchCommand(cmd.id);
    return true;
  }

  function dispatchCommand(commandId: string, payload?: PluginHookPayload): void {
    const cmd = commands.value.find((c) => c.id === commandId) as
      (PluginCommandEntry & { pluginId?: string }) | undefined;
    if (!cmd || !cmd.pluginId) return;
    const handle = workers.value[cmd.pluginId];
    if (!handle || !readyWorkers.has(cmd.pluginId)) return;
    try {
      handle.postInvokeCommand(commandId, payload);
    } catch (e) {
      logPush(
        cmd.pluginId,
        `[error] invoke-command failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  function invokeCommandWithContext(commandId: string, payload: PluginHookPayload): void {
    dispatchCommand(commandId, payload);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => spawner.terminateAll());
  }

  return {
    plugins,
    commands,
    logs,
    visuals,
    decorations,
    layoutVariants,
    pluginSettings,
    loading,
    load,
    toggle,
    uninstall,
    installFromFolder,
    refresh,
    emitHook,
    dispatchCommand,
    dispatchShortcut,
    commandsIn,
    invokeCommandWithContext,
    dispatchApi,
    settingsOf,
    saveSetting,
    settingFields
  };
});
