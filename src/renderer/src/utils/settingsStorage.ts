import type { Ref } from 'vue';
import { logger } from '@shared/logger';
import type {
  AppearanceSettings,
  PlaybackSettings,
  ExplorerSettings,
  LibrarySettings,
  DownloadSettings,
  ShortcutSettings,
  NetworkSettings,
  ApiKeySettings,
  YoutubeAuthSettings,
  UpdateSettings,
  ToastSettings,
  DependencyStatus,
  AppSettings,
  GeneralSettings,
  StatusBarSettings,
  HomeSettings
} from '@renderer/types/settings';

interface SettingsState {
  general: Ref<GeneralSettings>;
  appearance: Ref<AppearanceSettings>;
  playback: Ref<PlaybackSettings>;
  explorer: Ref<ExplorerSettings>;
  library: Ref<LibrarySettings>;
  download: Ref<DownloadSettings>;
  shortcuts: Ref<ShortcutSettings>;
  network: Ref<NetworkSettings>;
  apiKeys: Ref<ApiKeySettings>;
  youtube: Ref<YoutubeAuthSettings>;
  updates: Ref<UpdateSettings>;
  toast: Ref<ToastSettings>;
  dependencies: Ref<Record<string, DependencyStatus>>;
  statusBar: Ref<StatusBarSettings>;
  home: Ref<HomeSettings>;
  /** Ulubione żyją tutaj, a nie we własnym store: są ustawieniem, a
   * posiadanie dwóch pisarzy dla jednego klucza oznaczało, że reset fabryczny lub import
   * ich nie widział. */
  favorites: Ref<string[]>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Rekurencyjnie scala zapisany patch z bieżącą (domyślną) wartością, tak by
 * klucze istniejące tylko w domyślnych — tj. pola dodane w nowszej wersji
 * aplikacji — przetrwały wczytanie. Tablice i wartości niebędące zwykłymi obiektami są zastępowane w całości.
 * Płytki Object.assign gubił takie zagnieżdżone domyślne, co objawiało się jako
 * "ustawienie po cichu wraca po aktualizacji".
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = key in base ? deepMerge((base as Record<string, unknown>)[key], value) : value;
  }
  return out as T;
}

const SETTINGS_GROUPS = [
  'general',
  'appearance',
  'playback',
  'explorer',
  'library',
  'download',
  'shortcuts',
  'network',
  'apiKeys',
  'youtube',
  'updates',
  'toast',
  'dependencies',
  'statusBar',
  'home'
] as const;

export function mergeSettings(target: SettingsState, data: Partial<AppSettings>): void {
  if (!isPlainObject(data)) return;
  for (const group of SETTINGS_GROUPS) {
    const patch = data[group];
    if (patch === undefined) continue;
    const ref = target[group] as unknown as Ref<Record<string, unknown>>;
    ref.value = deepMerge(ref.value, patch);
  }
  if (Array.isArray(data.favorites)) target.favorites.value = [...data.favorites];
}

export async function loadSettings(target: SettingsState): Promise<void> {
  try {
    if (window.api) {
      const data = await window.api.invoke('settings:get');
      if (data) mergeSettings(target, data);
    }
  } catch (e) {
    // Nigdy tego nie ukrywaj: nieudane wczytanie objawia się jako "ustawienia same się resetują".
    logger.warn('settings', 'loadSettings failed, falling back to defaults', e);
  }
}

export async function persistSettings(state: SettingsState): Promise<void> {
  try {
    if (window.api) {
      const payload = JSON.parse(
        JSON.stringify({
          general: state.general.value,
          appearance: state.appearance.value,
          playback: state.playback.value,
          explorer: state.explorer.value,
          library: state.library.value,
          download: state.download.value,
          shortcuts: state.shortcuts.value,
          network: state.network.value,
          apiKeys: state.apiKeys.value,
          youtube: state.youtube.value,
          updates: state.updates.value,
          toast: state.toast.value,
          dependencies: state.dependencies.value,
          statusBar: state.statusBar.value,
          home: state.home.value,
          favorites: state.favorites.value
        })
      );
      await window.api.invoke('settings:set', payload);
    }
  } catch (e) {
    logger.warn('settings', 'persistSettings failed', e);
  }
}
