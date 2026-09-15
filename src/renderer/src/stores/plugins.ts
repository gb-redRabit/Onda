import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import type {
  PluginInfo,
  PluginExample,
  PluginManifest,
  IpcPluginInstallResult
} from '@shared/types/ipc';
import type { PluginCommandEntry } from '@renderer/modules/plugins/plugin-shim';
import type { PluginWorkerHandle } from '@renderer/modules/plugins/pluginWorker';
import { createPluginSpawner, type PluginUiStatus } from '@renderer/modules/plugins/pluginSpawner';
import { createPluginApi } from '@renderer/modules/plugins/pluginApi';
import { createPluginCommands } from '@renderer/modules/plugins/pluginCommands';
import { createPluginSettings } from '@renderer/modules/plugins/pluginSettings';
import { createPluginLogs } from '@renderer/modules/plugins/pluginLogs';
import { logger } from '@shared/logger';
import {
  LAYOUT_ELEMENT_IDS,
  PLUGIN_HOST_VARIANTS,
  omitKey,
  snapshotTrack
} from '@renderer/utils/plugins-helpers';
export { LAYOUT_ELEMENT_IDS, PLUGIN_HOST_VARIANTS, snapshotTrack };
export type { TrackSnapshot } from '@renderer/utils/plugins-helpers';
export type { PluginUiStatus };
import { computeDecorations, computeLayoutVariants } from '@renderer/utils/plugins-derive';

export interface PluginUiInfo extends PluginInfo {
  status: PluginUiStatus;
  error?: string;
}

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<PluginUiInfo[]>([]);
  const examples = ref<PluginExample[]>([]);
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

  const { logPush } = createPluginLogs(logs);

  function setStatus(id: string, status: PluginUiStatus, error?: string): void {
    plugins.value = plugins.value.map((p) => (p.id === id ? { ...p, status, error } : p));
  }

  function manifestOf(id: string): PluginManifest | undefined {
    return manifests.value[id];
  }

  const { settingsOf, saveSetting, settingFields } = createPluginSettings({
    pluginSettings,
    getManifest: manifestOf
  });

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

  async function loadExamples(): Promise<void> {
    try {
      examples.value = (await window.api.pluginsListExamples()) || [];
    } catch (e) {
      logger.warn('plugins', 'plugins.loadExamples failed', e);
    }
  }

  async function load(): Promise<void> {
    loading.value = true;
    try {
      await loadExamples();
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

  async function installExample(id: string): Promise<IpcPluginInstallResult> {
    const result = await window.api.pluginsInstallExample(id);
    if (result.success && result.installed) {
      await load();
    }
    return result;
  }

  async function refresh(): Promise<void> {
    for (const id of Object.keys(workers.value)) spawner.terminatePlugin(id, true);
    await load();
  }

  const { emitHook, commandsIn, dispatchShortcut, dispatchCommand, invokeCommandWithContext } =
    createPluginCommands({ commands, workers, readyWorkers, logPush });

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => spawner.terminateAll());
  }

  return {
    plugins,
    examples,
    commands,
    logs,
    visuals,
    decorations,
    layoutVariants,
    pluginSettings,
    loading,
    load,
    loadExamples,
    toggle,
    uninstall,
    installFromFolder,
    installExample,
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
