import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  AppearanceSettings,
  PlaybackSettings,
  ExplorerSettings,
  LibrarySettings,
  DownloadSettings,
  NetworkSettings,
  ApiKeySettings,
  YoutubeAuthSettings,
  UpdateSettings,
  ToastSettings,
  DependencyStatus,
  AppSettings
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
  DEFAULT_YOUTUBE_AUTH,
  DEFAULT_UPDATES,
  DEFAULT_TOAST
} from '@renderer/utils/constants';
import { loadSettings, persistSettings, mergeSettings } from '@renderer/utils/settingsStorage';

export const useSettingsStore = defineStore('settings', () => {
  const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE });
  const playback = ref<PlaybackSettings>({ ...DEFAULT_PLAYBACK });
  const explorer = ref<ExplorerSettings>({ ...DEFAULT_EXPLORER });
  const library = ref<LibrarySettings>({ ...DEFAULT_LIBRARY });
  const download = ref<DownloadSettings>({ ...DEFAULT_DOWNLOAD });
  const shortcuts = ref<Record<string, string>>({ ...DEFAULT_SHORTCUTS });
  const network = ref<NetworkSettings>({ ...DEFAULT_NETWORK });
  const apiKeys = ref<ApiKeySettings>({ ...DEFAULT_API_KEYS });
  const youtube = ref<YoutubeAuthSettings>({ ...DEFAULT_YOUTUBE_AUTH });
  const updates = ref<UpdateSettings>({ ...DEFAULT_UPDATES });
  const toast = ref<ToastSettings>({ ...DEFAULT_TOAST });
  const dependencies = ref<Record<string, DependencyStatus>>({});
  const isLoaded = ref(false);

  async function load() {
    await loadSettings({
      appearance,
      playback,
      explorer,
      library,
      download,
      shortcuts,
      network,
      apiKeys,
      youtube,
      updates,
      toast,
      dependencies
    });
    isLoaded.value = true;
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persistSettings({
        appearance,
        playback,
        explorer,
        library,
        download,
        shortcuts,
        network,
        apiKeys,
        youtube,
        updates,
        toast,
        dependencies
      });
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

  function updateYoutube(partial: Partial<YoutubeAuthSettings>) {
    Object.assign(youtube.value, partial);
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
    youtube.value = { ...DEFAULT_YOUTUBE_AUTH };
    updates.value = { ...DEFAULT_UPDATES };
    dependencies.value = {};
    toast.value = { ...DEFAULT_TOAST };
    save();
  }

  function applyImported(data: Partial<AppSettings>) {
    mergeSettings(
      {
        appearance,
        playback,
        explorer,
        library,
        download,
        shortcuts,
        network,
        apiKeys,
        youtube,
        updates,
        toast,
        dependencies
      },
      data
    );
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

  function updateUpdates(partial: Partial<UpdateSettings>) {
    Object.assign(updates.value, partial);
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
    youtube,
    updates,
    toast,
    dependencies,
    isLoaded,
    load,
    save,
    updateAppearance,
    updatePlayback,
    updateExplorer,
    updateLibrary,
    updateDownload,
    updateYoutube,
    updateShortcut,
    resetToDefaults,
    applyImported,
    updateDependency,
    getDependency,
    updateToast,
    updateUpdates
  };
});
