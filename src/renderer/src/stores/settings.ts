import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  AppSettings,
  AppearanceSettings,
  PlaybackSettings,
  ExplorerSettings,
  LibrarySettings,
  DownloadSettings,
  NetworkSettings,
  ApiKeySettings,
  UpdateSettings,
  ToastSettings,
  DependencyStatus
} from '@renderer/types/settings';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_PLAYBACK,
  DEFAULT_DOWNLOAD,
  DEFAULT_EXPLORER,
  DEFAULT_LIBRARY,
  DEFAULT_SHORTCUTS,
  DEFAULT_NETWORK,
  DEFAULT_API_KEYS,
  DEFAULT_UPDATES,
  DEFAULT_TOAST
} from '@renderer/utils/constants';

export const useSettingsStore = defineStore('settings', () => {
  const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE });
  const playback = ref<PlaybackSettings>({ ...DEFAULT_PLAYBACK });
  const explorer = ref<ExplorerSettings>({ ...DEFAULT_EXPLORER });
  const library = ref<LibrarySettings>({ ...DEFAULT_LIBRARY });
  const download = ref<DownloadSettings>({ ...DEFAULT_DOWNLOAD });
  const shortcuts = ref<Record<string, string>>({ ...DEFAULT_SHORTCUTS });
  const network = ref<NetworkSettings>({ ...DEFAULT_NETWORK });
  const apiKeys = ref<ApiKeySettings>({ ...DEFAULT_API_KEYS });
  const updates = ref<UpdateSettings>({ ...DEFAULT_UPDATES });
  const toast = ref<ToastSettings>({ ...DEFAULT_TOAST });
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
        if (data.appearance) Object.assign(appearance.value, data.appearance);
        if (data.playback) Object.assign(playback.value, data.playback);
        if (data.explorer) Object.assign(explorer.value, data.explorer);
        if (data.library) Object.assign(library.value, data.library);
        if (data.download) Object.assign(download.value, data.download);
        if (data.shortcuts) Object.assign(shortcuts.value, data.shortcuts);
        if (data.network) Object.assign(network.value, data.network);
        if (data.apiKeys) Object.assign(apiKeys.value, data.apiKeys);
        if (data.updates) Object.assign(updates.value, data.updates);
        if (data.toast) Object.assign(toast.value, data.toast);
        if (data.dependencies) Object.assign(dependencies.value, data.dependencies);
      }
    } catch {
      // use defaults
    }
    isLoaded.value = true;
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const _save = async () => {
    try {
      if (window.api) {
        const payload = JSON.parse(
          JSON.stringify({
            appearance: appearance.value,
            playback: playback.value,
            explorer: explorer.value,
            library: library.value,
            download: download.value,
            shortcuts: shortcuts.value,
            network: network.value,
            apiKeys: apiKeys.value,
            updates: updates.value,
            toast: toast.value,
            dependencies: dependencies.value
          })
        );
        await window.api.invoke('settings:set', payload);
      }
    } catch {
      // silent
    }
  };

  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      _save();
    }, 300);
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
    toast.value = { ...DEFAULT_TOAST };
    save();
  }

  function updateDependency(name: string, status: Omit<DependencyStatus, 'name'>) {
    dependencies.value[name] = { name, ...status };
    save();
  }

  function getDependency(name: string): DependencyStatus | undefined {
    return dependencies.value[name];
  }

  function updateToast(partial: Partial<ToastSettings>) {
    Object.assign(toast.value, partial);
    save();
  }

  function updateExplorer(partial: Partial<ExplorerSettings>) {
    Object.assign(explorer.value, partial);
    save();
  }

  function updateLibrary(partial: Partial<LibrarySettings>) {
    Object.assign(library.value, partial);
    save();
  }

  return {
    appearance,
    playback,
    explorer,
    library,
    download,
    shortcuts,
    network,
    apiKeys,
    updates,
    toast,
    dependencies,
    isLoaded,
    cssVariables,
    load,
    save,
    updateAppearance,
    updatePlayback,
    updateExplorer,
    updateLibrary,
    updateDownload,
    updateShortcut,
    resetToDefaults,
    updateDependency,
    getDependency,
    updateToast
  };
});
