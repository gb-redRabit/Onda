import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import type {
  PluginInfo,
  PluginExample,
  PluginManifest,
  IpcPluginInstallResult
} from '@shared/types/ipc';
import type { PluginCommandEntry } from '@renderer/modules/plugins/plugin-shim';
import type { PluginSlotItem } from '@shared/plugin-ui-slots';
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
  const slots = ref<Record<string, Record<string, PluginSlotItem[]>>>({});
  const pluginSettings = ref<Record<string, Record<string, unknown>>>({});

  const manifests = ref<Record<string, PluginManifest>>({});
  const workers = shallowRef<Record<string, PluginWorkerHandle>>({});
  const readyWorkers = new Set<string>();
  let hasLoaded = false;
  let loadPromise: Promise<void> | null = null;

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
    if (slots.value[id]) slots.value = omitKey(slots.value, id);
    if (pluginSettings.value[id]) pluginSettings.value = omitKey(pluginSettings.value, id);
  }

  const dispatchApi = createPluginApi({
    getManifest: manifestOf,
    getSettings: settingsOf,
    saveSetting,
    visuals,
    slots
  });

  const spawner = createPluginSpawner({
    commands,
    workers,
    readyWorkers,
    logPush,
    setStatus,
    onReady(id) {
      if (manifestOf(id)?.hooks?.includes('app:start')) {
        workers.value[id]?.postHook('app:start', {});
      }
    },
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

  async function load(force = false): Promise<void> {
    if (loadPromise) return loadPromise;
    if (hasLoaded && !force) return;
    loading.value = true;
    hasLoaded = false;
    loadPromise = (async () => {
      try {
        for (const id of Object.keys(workers.value)) spawner.terminatePlugin(id, true);
        await loadExamples();
        const list = (await window.api.pluginsList()) || [];
        manifests.value = {};
        workers.value = {};
        readyWorkers.clear();
        commands.value = [];
        visuals.value = {};
        slots.value = {};
        plugins.value = list.map((p) => ({ ...p, status: 'new' as PluginUiStatus }));
        logs.value = {};
        pluginSettings.value = {};
        const fetchedSettings = await Promise.all(
          list.map(async (plugin) => {
            let value: Record<string, unknown>;
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
        hasLoaded = true;
      } catch (e) {
        logger.error('plugins', 'plugins.load failed', e);
      }
    })();
    try {
      await loadPromise;
    } finally {
      loadPromise = null;
      loading.value = false;
    }
  }

  /**
   * Włącza plugin po przeglądzie: proces main wydaje token zgody dla
   * manifestu + pliku wejściowego, który ma uruchomić, więc zatwierdzenie nie może być
   * powtórzone przeciw innemu kodowi.
   */
  async function approveAndEnable(id: string): Promise<boolean> {
    const info = plugins.value.find((p) => p.id === id);
    if (!info) return false;
    const fetched = await window.api.pluginsGet(id);
    if (!fetched.success || !fetched.consentHash) return false;
    return await toggle(id, fetched.consentHash);
  }

  async function toggle(id: string, approvedConsent?: string): Promise<boolean> {
    const info = plugins.value.find((p) => p.id === id);
    const enabled = info ? !info.enabled : false;
    if (!info || (enabled && !approvedConsent)) return false;
    const ok = await window.api.pluginsToggle(id, enabled, approvedConsent);
    if (!ok) return false;
    if (enabled) {
      plugins.value = plugins.value.map((p) =>
        p.id === id ? { ...p, enabled: true, status: 'new', permissionReviewRequired: false } : p
      );
      await spawner.spawnPlugin(id);
    } else {
      spawner.terminatePlugin(id, false);
      plugins.value = plugins.value.map((p) =>
        p.id === id ? { ...p, enabled: false, status: 'new' } : p
      );
    }
    return true;
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
      await load(true);
    }
    return result;
  }

  async function installExample(id: string): Promise<IpcPluginInstallResult> {
    const result = await window.api.pluginsInstallExample(id);
    if (result.success && result.installed) {
      await load(true);
    }
    return result;
  }

  async function refresh(): Promise<void> {
    await load(true);
  }

  const { emitHook, commandsIn, dispatchShortcut, dispatchCommand, invokeCommandWithContext } =
    createPluginCommands({ commands, workers, readyWorkers, getManifest: manifestOf, logPush });

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => spawner.terminateAll());
  }

  return {
    plugins,
    examples,
    commands,
    logs,
    visuals,
    slots,
    decorations,
    layoutVariants,
    pluginSettings,
    loading,
    load,
    loadExamples,
    toggle,
    approveAndEnable,
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
