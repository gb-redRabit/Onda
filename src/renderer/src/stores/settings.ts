import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  AppSettings,
  AppearanceSettings,
  PlaybackSettings,
  DownloadSettings,
  NetworkSettings,
  ApiKeySettings,
  UpdateSettings,
  DependencyStatus
} from '@renderer/types/settings';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_PLAYBACK,
  DEFAULT_DOWNLOAD,
  DEFAULT_SHORTCUTS,
  DEFAULT_NETWORK,
  DEFAULT_API_KEYS,
  DEFAULT_UPDATES
} from '@renderer/utils/constants';

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useSettingsStore = defineStore('settings', () => {
  const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE });
  const playback = ref<PlaybackSettings>({ ...DEFAULT_PLAYBACK });
  const download = ref<DownloadSettings>({ ...DEFAULT_DOWNLOAD });
  const shortcuts = ref<Record<string, string>>({ ...DEFAULT_SHORTCUTS });
  const network = ref<NetworkSettings>({ ...DEFAULT_NETWORK });
  const apiKeys = ref<ApiKeySettings>({ ...DEFAULT_API_KEYS });
  const updates = ref<UpdateSettings>({ ...DEFAULT_UPDATES });
  const dependencies = ref<Record<string, DependencyStatus>>({});
  const isLoaded = ref(false);

  const cssVariables = computed(() => ({
    '--accent-color': appearance.value.accentColor,
    '--font-size': `${appearance.value.fontSize}px`
  }));

  async function load() {
    try {
      if (window.api) {
        const data = (await window.api.invoke('settings:get')) as Partial<AppSettings>;
        if (data.appearance) appearance.value = data.appearance;
        if (data.playback) playback.value = data.playback;
        if (data.download) download.value = data.download;
        if (data.shortcuts) shortcuts.value = data.shortcuts;
        if (data.network) network.value = data.network;
        if (data.apiKeys) apiKeys.value = data.apiKeys;
        if (data.updates) updates.value = data.updates;
        if (data.dependencies) dependencies.value = data.dependencies;
      }
    } catch {
      // use defaults
    }
    isLoaded.value = true;
  }

  const _save = async () => {
    try {
      if (window.api) {
        await window.api.invoke('settings:set', {
          appearance: appearance.value,
          playback: playback.value,
          download: download.value,
          shortcuts: shortcuts.value,
          network: network.value,
          apiKeys: apiKeys.value,
          updates: updates.value,
          dependencies: dependencies.value
        });
      }
    } catch {
      // silent fail
    }
  };

  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(_save, 300);
  };

  function updateAppearance(partial: Partial<AppearanceSettings>) {
    Object.assign(appearance.value, partial);
    save();
  }

  function updatePlayback(partial: Partial<PlaybackSettings>) {
    Object.assign(playback.value, partial);
    save();
  }

  function updateDownload(partial: Partial<DownloadSettings>) {
    Object.assign(download.value, partial);
    save();
  }

  function updateShortcut(action: string, key: string) {
    shortcuts.value[action] = key;
    save();
  }

  function resetToDefaults() {
    appearance.value = { ...DEFAULT_APPEARANCE };
    playback.value = { ...DEFAULT_PLAYBACK };
    download.value = { ...DEFAULT_DOWNLOAD };
    shortcuts.value = { ...DEFAULT_SHORTCUTS };
    network.value = { ...DEFAULT_NETWORK };
    apiKeys.value = { ...DEFAULT_API_KEYS };
    updates.value = { ...DEFAULT_UPDATES };
    dependencies.value = {};
    save();
  }

  function updateDependency(name: string, status: Omit<DependencyStatus, 'name'>) {
    dependencies.value[name] = { name, ...status };
    save();
  }

  function getDependency(name: string): DependencyStatus | undefined {
    return dependencies.value[name];
  }

  return {
    appearance,
    playback,
    download,
    shortcuts,
    network,
    apiKeys,
    updates,
    dependencies,
    isLoaded,
    cssVariables,
    load,
    save,
    updateAppearance,
    updatePlayback,
    updateDownload,
    updateShortcut,
    resetToDefaults,
    updateDependency,
    getDependency
  };
});
