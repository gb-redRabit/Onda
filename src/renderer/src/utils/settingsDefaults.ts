import type { useSettingsStore } from '@renderer/stores/settings';
import {
  DEFAULT_API_KEYS,
  DEFAULT_APPEARANCE,
  DEFAULT_DOWNLOAD,
  DEFAULT_EXPLORER,
  DEFAULT_GENERAL,
  DEFAULT_HOME,
  DEFAULT_LIBRARY,
  DEFAULT_NETWORK,
  DEFAULT_PLAYBACK,
  DEFAULT_STATUS_BAR,
  DEFAULT_TOAST,
  DEFAULT_UPDATES,
  DEFAULT_YOUTUBE_AUTH
} from '@renderer/utils/constants';

type SettingsStore = ReturnType<typeof useSettingsStore>;

// Path form: `<group>.<field>` (e.g. `playback.defaultVolume`). Used by
// SettingsRow to show "changed from default" and to reset a single setting, so
// every control gets that for free without per-tab bookkeeping.
const DEFAULTS: Record<string, Record<string, unknown>> = {
  general: DEFAULT_GENERAL as unknown as Record<string, unknown>,
  appearance: DEFAULT_APPEARANCE as unknown as Record<string, unknown>,
  playback: DEFAULT_PLAYBACK as unknown as Record<string, unknown>,
  explorer: DEFAULT_EXPLORER as unknown as Record<string, unknown>,
  library: DEFAULT_LIBRARY as unknown as Record<string, unknown>,
  download: DEFAULT_DOWNLOAD as unknown as Record<string, unknown>,
  network: DEFAULT_NETWORK as unknown as Record<string, unknown>,
  apiKeys: DEFAULT_API_KEYS as unknown as Record<string, unknown>,
  youtube: DEFAULT_YOUTUBE_AUTH as unknown as Record<string, unknown>,
  updates: DEFAULT_UPDATES as unknown as Record<string, unknown>,
  toast: DEFAULT_TOAST as unknown as Record<string, unknown>,
  statusBar: DEFAULT_STATUS_BAR as unknown as Record<string, unknown>,
  home: DEFAULT_HOME as unknown as Record<string, unknown>
};

const UPDATERS: Record<string, (patch: Record<string, unknown>) => void> = {
  general: (patch) => store().updateGeneral(patch as never),
  appearance: (patch) => store().updateAppearance(patch as never),
  playback: (patch) => store().updatePlayback(patch as never),
  explorer: (patch) => store().updateExplorer(patch as never),
  library: (patch) => store().updateLibrary(patch as never),
  download: (patch) => store().updateDownload(patch as never),
  network: (patch) => store().updateNetwork(patch as never),
  updates: (patch) => store().updateUpdates(patch as never),
  toast: (patch) => store().updateToast(patch as never),
  statusBar: (patch) => store().updateStatusBar(patch as never),
  home: (patch) => store().updateHome(patch as never)
};

let storeRef: SettingsStore | null = null;

/** Called once from the settings view so the helpers can write back. */
export function bindSettingsStore(store: SettingsStore): void {
  storeRef = store;
}

function store(): SettingsStore {
  if (!storeRef) throw new Error('settings store not bound');
  return storeRef;
}

function split(path: string): [string, string] {
  const [group, field] = path.split('.');
  return [group, field];
}

export function defaultOf(path: string): unknown {
  const [group, field] = split(path);
  return DEFAULTS[group]?.[field];
}

export function currentOf(path: string): unknown {
  const [group, field] = split(path);
  const bag = (store() as unknown as Record<string, Record<string, unknown>>)[group];
  return bag?.[field];
}

/** True when the current value differs from the shipped default. */
export function isSettingModified(path: string): boolean {
  const current = currentOf(path);
  const fallback = defaultOf(path);
  if (fallback === undefined) return false;
  if (typeof current === 'object' || typeof fallback === 'object') {
    return JSON.stringify(current) !== JSON.stringify(fallback);
  }
  return current !== fallback;
}

/** Restores a single setting to its shipped default. */
export function resetSetting(path: string): void {
  const [group, field] = split(path);
  const fallback = DEFAULTS[group]?.[field];
  if (fallback === undefined) return;
  const updater = UPDATERS[group];
  if (!updater) return;
  updater({ [field]: fallback });
}
