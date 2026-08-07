import type { Ref } from 'vue';
import type {
  AppearanceSettings,
  PlaybackSettings,
  ExplorerSettings,
  LibrarySettings,
  DownloadSettings,
  ShortcutSettings,
  NetworkSettings,
  ApiKeySettings,
  UpdateSettings,
  ToastSettings,
  DependencyStatus,
  AppSettings
} from '@renderer/types/settings';

export interface SettingsState {
  appearance: Ref<AppearanceSettings>;
  playback: Ref<PlaybackSettings>;
  explorer: Ref<ExplorerSettings>;
  library: Ref<LibrarySettings>;
  download: Ref<DownloadSettings>;
  shortcuts: Ref<ShortcutSettings>;
  network: Ref<NetworkSettings>;
  apiKeys: Ref<ApiKeySettings>;
  updates: Ref<UpdateSettings>;
  toast: Ref<ToastSettings>;
  dependencies: Ref<Record<string, DependencyStatus>>;
}

export function mergeSettings(target: SettingsState, data: Partial<AppSettings>): void {
  if (data.appearance) Object.assign(target.appearance.value, data.appearance);
  if (data.playback) Object.assign(target.playback.value, data.playback);
  if (data.explorer) Object.assign(target.explorer.value, data.explorer);
  if (data.library) Object.assign(target.library.value, data.library);
  if (data.download) Object.assign(target.download.value, data.download);
  if (data.shortcuts) Object.assign(target.shortcuts.value, data.shortcuts);
  if (data.network) Object.assign(target.network.value, data.network);
  if (data.apiKeys) Object.assign(target.apiKeys.value, data.apiKeys);
  if (data.updates) Object.assign(target.updates.value, data.updates);
  if (data.toast) Object.assign(target.toast.value, data.toast);
  if (data.dependencies) Object.assign(target.dependencies.value, data.dependencies);
}

export async function loadSettings(target: SettingsState): Promise<void> {
  try {
    if (window.api) {
      const data = await window.api.invoke('settings:get');
      if (data) mergeSettings(target, data);
    }
  } catch {
    // use defaults
  }
}

export async function persistSettings(state: SettingsState): Promise<void> {
  try {
    if (window.api) {
      const payload = JSON.parse(
        JSON.stringify({
          appearance: state.appearance.value,
          playback: state.playback.value,
          explorer: state.explorer.value,
          library: state.library.value,
          download: state.download.value,
          shortcuts: state.shortcuts.value,
          network: state.network.value,
          apiKeys: state.apiKeys.value,
          updates: state.updates.value,
          toast: state.toast.value,
          dependencies: state.dependencies.value
        })
      );
      await window.api.invoke('settings:set', payload);
    }
  } catch {
    // silent
  }
}
