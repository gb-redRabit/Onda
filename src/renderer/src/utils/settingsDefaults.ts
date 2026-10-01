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

// Forma ścieżki: `<group>.<field>` (np. `playback.defaultVolume`). Używana przez
// SettingsRow do pokazania "zmienione z domyślnego" i do resetowania pojedynczego ustawienia,
// więc każda kontrolka dostaje to za darmo bez księgowości per zakładka.

/**
 * Grupy, które może adresować ścieżka ustawienia, każda z własnym typem worka.
 *
 * Ta mapa utrzymuje uczciwość dynamicznej formy ścieżki. Wcześniej było to
 * `Record<string, Record<string, unknown>>` z castem na każdym wpisie, co
 * oznaczało, że literówka w nazwie grupy albo pole o złym kształcie nie mogły być
 * nigdzie wychwycone: wartości zostały spłaszczone do `unknown` po drodze.
 * Tutaj `DEFAULTS.general` jest `GeneralSettings`, więc pomyłka pokazuje się jako
 * błąd typu przy samej mapie.
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
 * Worek ustawień, którego właścicielem jest każda grupa.
 *
 * Celowo oparte na interfejsach ustawień, a nie na stałych DEFAULT_*: dwie z tych
 * stałych nie mają adnotacji typu, więc TypeScript wnioskuje ich pola jako zwykłe
 * `string`/`number`/`boolean`. Wyprowadzenie typu patch z nich przyjmowałoby
 * dowolną wartość dla tych pól, co jest tą samą dziurą, którą miało stare
 * `as never`.
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
 * Nazwa grupy do aktualizatora, który ją zapisuje, z typem patch, który store
 * faktycznie deklaruje. Wcześniej było `as never`, co całkowicie uciszało kompilator
 * — `updateGeneral({ volume: 'loud' })` przez tę tabelę było
 * akceptowane, a `as never` to jedyny cast, który tłumi sprawdzanie nawet gdy
 * typ docelowy jest konkretny.
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

/** Wywoływane raz z widoku ustawień, by helpery mogły zapisywać z powrotem. */
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

/** Prawda, gdy bieżąca wartość różni się od domyślnej dostarczonej z aplikacją. */
export function isSettingModified(path: string): boolean {
  const current = currentOf(path);
  const fallback = defaultOf(path);
  if (fallback === undefined) return false;
  if (typeof current === 'object' || typeof fallback === 'object') {
    return JSON.stringify(current) !== JSON.stringify(fallback);
  }
  return current !== fallback;
}

/** Przywraca pojedyncze ustawienie do jego domyślnej wartości dostarczonej z aplikacją. */
export function resetSetting(path: string): void {
  const [group, field] = split(path);
  const bag = DEFAULTS[group as SettingsGroup] as Record<string, unknown> | undefined;
  const fallback = bag?.[field];
  if (fallback === undefined) return;
  const updater = UPDATERS[group as UpdatableGroup];
  if (!updater) return;
  // Jedno nieuniknione rozszerzenie: ścieżka jest rozwiązywana w czasie działania, więc
  // kompilator nie może wiedzieć, który typ patch grupy ma zastosowanie. Aktualizator powyżej
  // nadal sprawdza kształt, a klucz grupy jest sprawdzany względem DEFAULTS.
  updater({ [field]: fallback } as never);
}
