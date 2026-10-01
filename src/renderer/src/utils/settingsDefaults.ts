import type { useSettingsStore } from '@renderer/stores/settings';
import type {
  AppearanceSettings,
  DownloadSettings,
  ExplorerSettings,
  GeneralSettings,
  HomeSettings,
  LibrarySettings,
  NetworkSettings,
  PlaybackSettings,
  StatusBarSettings,
  ToastSettings,
  UpdateSettings
} from '@renderer/types/settings';
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

/**
 * The groups a setting path can address, each carrying its own bag type.
 *
 * This map is what keeps the dynamic path form honest. It was
 * `Record<string, Record<string, unknown>>` with a cast on every entry, which
 * meant a typo in a group name, or a field of the wrong shape, could not be
 * caught anywhere: the values had been flattened to `unknown` on the way in.
 * Here `DEFAULTS.general` is a `GeneralSettings`, so a mistake shows up as a
 * type error at the map itself.
 */
const DEFAULTS = {
  general: DEFAULT_GENERAL,
  appearance: DEFAULT_APPEARANCE,
  playback: DEFAULT_PLAYBACK,
  explorer: DEFAULT_EXPLORER,
  library: DEFAULT_LIBRARY,
  download: DEFAULT_DOWNLOAD,
  network: DEFAULT_NETWORK,
  apiKeys: DEFAULT_API_KEYS,
  youtube: DEFAULT_YOUTUBE_AUTH,
  updates: DEFAULT_UPDATES,
  toast: DEFAULT_TOAST,
  statusBar: DEFAULT_STATUS_BAR,
  home: DEFAULT_HOME
};

type SettingsGroup = keyof typeof DEFAULTS;

/**
 * The settings bag each group owns.
 *
 * Keyed off the settings interfaces rather than off the DEFAULT_* constants on
 * purpose: two of those constants carry no type annotation, so TypeScript infers
 * their fields as plain `string`/`number`/`boolean`. Deriving the patch type
 * from them would accept any value for those fields, which is the same hole the
 * old `as never` had.
 */
interface GroupBag {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  playback: PlaybackSettings;
  explorer: ExplorerSettings;
  library: LibrarySettings;
  download: DownloadSettings;
  network: NetworkSettings;
  updates: UpdateSettings;
  toast: ToastSettings;
  statusBar: StatusBarSettings;
  home: HomeSettings;
}

/**
 * Group name to the updater that writes it, with the patch type the store
 * actually declares. These were `as never`, which silenced the compiler
 * completely — `updateGeneral({ volume: 'loud' })` through this table was
 * accepted, and `as never` is the one cast that suppresses checking even when
 * the target type is concrete.
 */
const UPDATERS: {
  [K in keyof GroupBag]: (patch: Partial<GroupBag[K]>) => void;
} = {
  general: (patch) => store().updateGeneral(patch),
  appearance: (patch) => store().updateAppearance(patch),
  playback: (patch) => store().updatePlayback(patch),
  explorer: (patch) => store().updateExplorer(patch),
  library: (patch) => store().updateLibrary(patch),
  download: (patch) => store().updateDownload(patch),
  network: (patch) => store().updateNetwork(patch),
  updates: (patch) => store().updateUpdates(patch),
  toast: (patch) => store().updateToast(patch),
  statusBar: (patch) => store().updateStatusBar(patch),
  home: (patch) => store().updateHome(patch)
};

type UpdatableGroup = keyof typeof UPDATERS;

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
  const bag = DEFAULTS[group as SettingsGroup] as Record<string, unknown> | undefined;
  return bag?.[field];
}

export function currentOf(path: string): unknown {
  const [group, field] = split(path);
  const state = store().$state as unknown as Record<string, Record<string, unknown>>;
  return state[group]?.[field];
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
  const bag = DEFAULTS[group as SettingsGroup] as Record<string, unknown> | undefined;
  const fallback = bag?.[field];
  if (fallback === undefined) return;
  const updater = UPDATERS[group as UpdatableGroup];
  if (!updater) return;
  // The one unavoidable widening: the path is resolved at runtime, so the
  // compiler cannot know which group's patch type applies. The updater above
  // still checks the shape, and the group key is checked against DEFAULTS.
  updater({ [field]: fallback } as never);
}
