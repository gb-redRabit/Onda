import type { Ref } from 'vue';
import type {
  AppSettings,
  AppearanceSettings,
  ApiKeySettings,
  DependencyStatus,
  DownloadSettings,
  ExplorerSettings,
  GeneralSettings,
  LibrarySettings,
  NetworkSettings,
  PlaybackSettings,
  StatusBarSettings,
  HomeSettings,
  ToastSettings,
  UpdateSettings,
  YoutubeAuthSettings
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
  DEFAULT_TOAST,
  DEFAULT_GENERAL,
  DEFAULT_STATUS_BAR,
  DEFAULT_HOME
} from '@renderer/utils/constants';
import { loadSettings, persistSettings, mergeSettings } from '@renderer/utils/settingsStorage';

export interface SettingsState {
  general: Ref<GeneralSettings>;
  appearance: Ref<AppearanceSettings>;
  playback: Ref<PlaybackSettings>;
  explorer: Ref<ExplorerSettings>;
  library: Ref<LibrarySettings>;
  download: Ref<DownloadSettings>;
  shortcuts: Ref<Record<string, string>>;
  network: Ref<NetworkSettings>;
  apiKeys: Ref<ApiKeySettings>;
  youtube: Ref<YoutubeAuthSettings>;
  updates: Ref<UpdateSettings>;
  toast: Ref<ToastSettings>;
  dependencies: Ref<Record<string, DependencyStatus>>;
  statusBar: Ref<StatusBarSettings>;
  home: Ref<HomeSettings>;
  favorites: Ref<string[]>;
  isLoaded: Ref<boolean>;
}

// Load/save/reset/import wiring extracted from `stores/settings.ts` (plan 2.8).
export function createSettingsPersistence(state: SettingsState) {
  const {
    general,
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
    statusBar,
    home,
    favorites,
    isLoaded
  } = state;

  const snapshot = () => ({
    general,
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
    statusBar,
    home,
    favorites
  });

  async function load() {
    await loadSettings(snapshot());
    isLoaded.value = true;
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  // Serialised writer: the newest snapshot always wins. A plain debounce cannot
  // cancel a `persistSettings` call already in flight, so a slider change racing
  // resetToDefaults/applyImported could land out of order in the store.
  let revision = 0;
  let persistedRevision = 0;
  let writing = false;

  async function drainWrites(): Promise<void> {
    if (writing) return;
    writing = true;
    try {
      while (persistedRevision < revision) {
        const target = revision;
        await persistSettings(snapshot());
        persistedRevision = target; // only after a successful write
      }
    } finally {
      writing = false;
    }
  }

  function scheduleSave(delay: number): void {
    revision += 1;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void drainWrites();
    }, delay);
  }

  const saveImmediate = () => scheduleSave(0);
  const save = () => scheduleSave(300);

  function resetToDefaults() {
    general.value = { ...DEFAULT_GENERAL };
    appearance.value = { ...DEFAULT_APPEARANCE };
    playback.value = { ...DEFAULT_PLAYBACK };
    explorer.value = { ...DEFAULT_EXPLORER };
    library.value = { ...DEFAULT_LIBRARY };
    download.value = { ...DEFAULT_DOWNLOAD };
    shortcuts.value = { ...DEFAULT_SHORTCUTS };
    network.value = { ...DEFAULT_NETWORK };
    apiKeys.value = { ...DEFAULT_API_KEYS };
    youtube.value = { ...DEFAULT_YOUTUBE_AUTH };
    updates.value = { ...DEFAULT_UPDATES };
    dependencies.value = {};
    toast.value = { ...DEFAULT_TOAST };
    statusBar.value = { ...DEFAULT_STATUS_BAR };
    home.value = { ...DEFAULT_HOME };
    favorites.value = [];
    save();
  }

  function applyImported(data: Partial<AppSettings>) {
    mergeSettings(snapshot(), data);
    save();
  }

  return { load, save, saveImmediate, resetToDefaults, applyImported };
}
