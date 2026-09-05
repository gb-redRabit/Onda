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
  AppSettings,
  GeneralSettings,
  StatusBarSettings
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
  AUDIO_LAYOUT_PRESETS
} from '@renderer/utils/constants';
import type { AudioLayoutElement, AudioLayoutPreset } from '@renderer/types/settings';
import { loadSettings, persistSettings, mergeSettings } from '@renderer/utils/settingsStorage';

export const useSettingsStore = defineStore('settings', () => {
  const general = ref<GeneralSettings>({ ...DEFAULT_GENERAL });
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
  const statusBar = ref<StatusBarSettings>({ ...DEFAULT_STATUS_BAR });
  const isLoaded = ref(false);

  async function load() {
    await loadSettings({
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
      statusBar
    });
    isLoaded.value = true;
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const saveImmediate = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    persistSettings({
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
      statusBar
    });
  };

  const save = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persistSettings({
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
        statusBar
      });
    }, 300);
  };

  function updateAppearance(partial: Partial<AppearanceSettings>) {
    Object.assign(appearance.value, partial);
    save();
  }

  function updateAudioLayoutElements(elements: AudioLayoutElement[]) {
    const layout = appearance.value.audioLayout;
    updateAppearance({ audioLayout: { ...layout, elements } });
  }

  function audioLayoutsEqual(a: AudioLayoutElement[], b: AudioLayoutElement[]): boolean {
    if (a.length !== b.length) return false;
    for (const elA of a) {
      const elB = b.find((el) => el.id === elA.id);
      if (
        !elB ||
        elA.x !== elB.x ||
        elA.y !== elB.y ||
        elA.width !== elB.width ||
        elA.height !== elB.height ||
        (elA.layer ?? 0) !== (elB.layer ?? 0) ||
        (elA.visible ?? true) !== (elB.visible ?? true) ||
        (elA.variant ?? '') !== (elB.variant ?? '')
      ) {
        return false;
      }
    }
    return true;
  }

  function factoryElements(preset: AudioLayoutPreset): AudioLayoutElement[] {
    return AUDIO_LAYOUT_PRESETS[preset]?.elements.map((el) => ({ ...el })) ?? AUDIO_LAYOUT_PRESETS.full.elements.map((el) => ({ ...el }));
  }

  function isStockLayout(elements: AudioLayoutElement[]): boolean {
    for (const key of Object.keys(AUDIO_LAYOUT_PRESETS)) {
      if (audioLayoutsEqual(elements, factoryElements(key as AudioLayoutPreset))) return true;
    }
    return false;
  }

  function applyAudioLayoutPreset(preset: AudioLayoutPreset) {
    const layout = appearance.value.audioLayout;
    const currentPreset = layout.preset ?? 'full';
    const customLayouts = layout.customLayouts ?? {};

    // Drop corrupt/no-op snapshots (e.g. from older builds that stored stock layouts
    // under every preset key) so presets never appear to be "the same one".
    const nextCustom: Record<string, AudioLayoutElement[]> = {};
    for (const [key, value] of Object.entries(customLayouts)) {
      if (!(key in AUDIO_LAYOUT_PRESETS)) continue;
      if (value && !isStockLayout(value)) {
        nextCustom[key] = value.map((el) => ({ ...el }));
      }
    }

    // 1. Keep a snapshot of the current (possibly edited) elements for the preset we are
    //    leaving, but only if it is a genuine custom layout.
    if (!isStockLayout(layout.elements)) {
      nextCustom[currentPreset] = layout.elements.map((el) => ({ ...el }));
    }

    // 2. Restore the target preset's saved custom layout if it exists, else the preset defaults.
    const presetElements = AUDIO_LAYOUT_PRESETS[preset];
    const elements =
      nextCustom[preset]?.map((el) => ({ ...el })) ??
      presetElements?.elements.map((el) => ({ ...el })) ??
      layout.elements;

    updateAppearance({
      audioLayout: {
        ...layout,
        preset,
        customLayouts: nextCustom,
        elements
      }
    });
  }

  function resetAudioLayoutPreset() {
    const layout = appearance.value.audioLayout;
    const currentPreset = layout.preset ?? 'full';
    const customLayouts = { ...(layout.customLayouts ?? {}) };

    // Reset always restores the current preset's own standard layout and discards
    // that preset's saved custom layout.
    delete customLayouts[currentPreset];

    updateAppearance({
      audioLayout: { ...layout, elements: factoryElements(currentPreset), customLayouts }
    });
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

  function updateNetwork(partial: Partial<NetworkSettings>) {
    Object.assign(network.value, partial);
    save();
  }

  function updateGeneral(partial: Partial<GeneralSettings>) {
    Object.assign(general.value, partial);
    save();
  }

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
    save();
  }

  function applyImported(data: Partial<AppSettings>) {
    mergeSettings(
      {
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

  function updateStatusBar(partial: Partial<StatusBarSettings>) {
    Object.assign(statusBar.value, partial);
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
    isLoaded,
    load,
    save,
    saveImmediate,
    updateGeneral,
    updateAppearance,
    updateAudioLayoutElements,
    applyAudioLayoutPreset,
    resetAudioLayoutPreset,
    updatePlayback,
    updateExplorer,
    updateLibrary,
    updateDownload,
    updateYoutube,
    updateShortcut,
    updateNetwork,
    updateStatusBar,
    resetToDefaults,
    applyImported,
    updateDependency,
    getDependency,
    updateToast,
    updateUpdates
  };
});
