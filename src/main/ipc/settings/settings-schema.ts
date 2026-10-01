import type { AppSettings } from '../../../shared/types/settings';
import {
  isPlainObject,
  str,
  num,
  bool,
  numClamped,
  enumOf,
  nullable,
  obj,
  stringRecord,
  primitiveRecord,
  recordOf,
  arrayOf,
  stringArray,
  viewModes,
  hexStr,
  zeroOne,
  sizeMultiplier,
  type Sanitizer
} from './settings-sanitizers';
import {
  migrateAppearance,
  migrateSettingsPayload,
  pipElementArray,
  SETTINGS_VERSION
} from './settings-migrations';

const GEOMETRY_FIELDS: Record<string, Sanitizer> = {
  radiusBox: numClamped(0, 32),
  radiusField: numClamped(0, 32),
  radiusSelector: numClamped(0, 32),
  sizeField: sizeMultiplier,
  sizeSelector: sizeMultiplier,
  border: numClamped(0, 4),
  depth: zeroOne,
  noise: zeroOne
};

const AUDIO_LAYOUT_ELEMENT_FIELDS: Record<string, Sanitizer> = {
  id: enumOf(['visualization', 'cover', 'progress', 'trackInfo', 'controls']),
  x: numClamped(0, 100),
  y: numClamped(0, 100),
  width: numClamped(1, 100),
  height: numClamped(1, 100),
  opacity: numClamped(0, 100),
  layer: numClamped(1, 5),
  visible: bool,
  bg: bool,
  bgOpacity: numClamped(0, 100),
  variant: enumOf([
    'default',
    'rounded',
    'ring',
    'glass',
    'classic',
    'minimal',
    'large',
    'thin',
    'neon',
    'standard',
    'compact'
  ])
};

const AUDIO_LAYOUT_FIELDS: Record<string, Sanitizer> = {
  elements: arrayOf(obj(AUDIO_LAYOUT_ELEMENT_FIELDS)),
  preset: enumOf(['compact', 'stacked', 'split', 'full', 'immersive']),
  hudOpacity: numClamped(0, 100),
  vizQuality: enumOf(['low', 'medium', 'high']),
  customLayouts: obj({
    compact: arrayOf(obj(AUDIO_LAYOUT_ELEMENT_FIELDS)),
    stacked: arrayOf(obj(AUDIO_LAYOUT_ELEMENT_FIELDS)),
    split: arrayOf(obj(AUDIO_LAYOUT_ELEMENT_FIELDS)),
    full: arrayOf(obj(AUDIO_LAYOUT_ELEMENT_FIELDS)),
    immersive: arrayOf(obj(AUDIO_LAYOUT_ELEMENT_FIELDS))
  })
};

const APPEARANCE_FIELDS: Record<string, Sanitizer> = {
  theme: enumOf([
    'dark',
    'light',
    'midnight',
    'spotify',
    'luxury',
    'cyberpunk',
    'aqua',
    'black',
    'lemonade',
    'abyss',
    'custom'
  ]),
  customBase: enumOf([
    'dark',
    'light',
    'midnight',
    'spotify',
    'luxury',
    'cyberpunk',
    'aqua',
    'black',
    'lemonade',
    'abyss'
  ]),
  customColors: recordOf(hexStr),
  geometry: obj(GEOMETRY_FIELDS),
  glassAlpha: numClamped(0, 100),
  fontSize: numClamped(8, 48),
  sidebarPosition: enumOf(['left', 'right']),
  sidebarCollapsed: bool,
  showPlaylists: bool,
  showAlbums: bool,
  locale: enumOf(['pl', 'en', 'auto']),
  animations: bool,
  audioPipDock: enumOf([
    'top',
    'bottom',
    'left',
    'right',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right'
  ]),
  audioPipAutoShow: bool,
  audioPipAutoHide: bool,
  audioPipCornerElements: pipElementArray,
  audioPipEdgeElements: pipElementArray,
  audioPipMode: enumOf(['minimal', 'medium', 'max', 'wide']),
  audioPipOpacity: numClamped(0, 1),
  audioPipPosition: enumOf(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  audioPipEdgePosition: enumOf(['top', 'bottom', 'left', 'right']),
  audioLayout: obj(AUDIO_LAYOUT_FIELDS)
};

const VISUALIZATION_FIELDS: Record<string, Sanitizer> = {
  mode: enumOf(['circle', 'bars', 'particles', 'wave', 'radial', 'spectrum', 'rings', 'none']),
  primaryColor: hexStr,
  secondaryColor: hexStr,
  sensitivity: numClamped(0, 1),
  smoothing: numClamped(0, 1),
  fpsCap: numClamped(15, 120)
};

const PLAYBACK_FIELDS: Record<string, Sanitizer> = {
  normalization: bool,
  replayGain: bool,
  gaplessPlayback: bool,
  autoPauseOnFocusLoss: bool,
  defaultVolume: numClamped(0, 1),
  rememberPosition: bool,
  pipPosition: enumOf(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  pipWidth: numClamped(200, 3840),
  pipHeight: numClamped(150, 2160),
  pipPreBuffer: bool,
  cursorHide: bool,
  // cursorTimeout jest w SEKUNDACH (renderer użływa czas * 1000; slider 1—10 s)
  cursorTimeout: numClamped(1, 30),
  resumePromptTimeout: numClamped(1, 60),
  playbackSpeed: numClamped(0.2, 3),
  videoFilter: str,
  visualization: obj(VISUALIZATION_FIELDS)
};

const EXPLORER_FIELDS: Record<string, Sanitizer> = {
  viewMode: enumOf(['extraSmall', 'small', 'medium', 'large', 'extraLarge', 'details']),
  sortBy: enumOf(['name', 'size', 'type', 'modified']),
  sortOrder: enumOf(['asc', 'desc']),
  confirmBeforeMove: bool,
  permanentDelete: bool
};

const LIBRARY_FIELDS: Record<string, Sanitizer> = {
  viewModes,
  coverCacheMaxEntries: numClamped(500, 10000)
};

const DOWNLOAD_FIELDS: Record<string, Sanitizer> = {
  defaultPath: str,
  sourcesDir: str,
  sourcesFolder: bool,
  defaultKind: enumOf(['audio', 'video']),
  defaultAudioFormat: enumOf(['best', 'mp3', 'flac', 'ogg', 'aac', 'opus', 'm4a', 'wav']),
  defaultAudioQuality: enumOf(['best', 'high', 'medium', 'low']),
  defaultVideoQuality: enumOf(['best', '2160p', '1440p', '1080p', '720p', '480p']),
  defaultVideoContainer: enumOf(['mp4', 'mkv', 'webm']),
  defaultCover: enumOf(['thumbnail', 'none', 'frame', 'clip']),
  defaultCoverFrameTime: numClamped(0, 3600),
  defaultCoverClipStart: numClamped(0, 3600),
  defaultCoverClipEnd: numClamped(0, 3600),
  defaultCoverClipFormat: enumOf(['webm', 'mp4']),
  filenameTemplate: str,
  maxConcurrent: numClamped(1, 8),
  retryAttempts: numClamped(0, 5),
  retryBaseMs: numClamped(500, 10000),
  tempDir: str,
  autoDownloadSubscriptions: bool,
  hashFiles: bool,
  smartMode: bool,
  defaultSubs: bool,
  defaultSubsLangs: str,
  nightScheduleEnabled: bool,
  nightScheduleStart: numClamped(0, 23),
  nightScheduleEnd: numClamped(0, 23),
  autoAddDownloadFolder: bool
};

const PROXY_FIELDS: Record<string, Sanitizer> = {
  enabled: bool,
  type: enumOf(['http', 'https', 'socks5']),
  host: str,
  port: numClamped(1, 65535),
  username: str,
  password: str
};

const NETWORK_FIELDS: Record<string, Sanitizer> = {
  proxy: obj(PROXY_FIELDS),
  proxyPerPlatform: bool,
  proxyYoutube: obj(PROXY_FIELDS),
  proxySoundcloud: obj(PROXY_FIELDS),
  defaultQualityPerPlatform: bool,
  youtubeQuality: str,
  soundcloudQuality: str,
  downloadSpeedLimit: numClamped(0, 1000000),
  userAgent: str
};

const GENERAL_FIELDS: Record<string, Sanitizer> = {
  autoLaunch: bool,
  startMinimized: bool,
  closeToTray: bool,
  restoreSession: bool,
  firstRunDone: bool,
  logLevel: enumOf(['debug', 'info', 'warn', 'error']),
  logMaxSizeMB: numClamped(1, 100)
};

function apiKeyEntry(v: unknown): unknown | undefined {
  if (!isPlainObject(v)) return undefined;
  if (typeof v.key !== 'string') return undefined;
  const out: Record<string, unknown> = {};
  if (typeof v.id === 'string') out.id = v.id;
  if (typeof v.name === 'string') out.name = v.name;
  if (typeof v.service === 'string') out.service = v.service;
  out.key = v.key;
  const cleanedValues = v.values !== undefined ? primitiveRecord(v.values) : undefined;
  if (cleanedValues !== undefined) out.values = cleanedValues;
  if (typeof v.isActive === 'boolean') out.isActive = v.isActive;
  return out;
}

const API_KEYS_FIELDS: Record<string, Sanitizer> = {
  keys: arrayOf(apiKeyEntry)
};

const YOUTUBE_FIELDS: Record<string, Sanitizer> = {
  method: enumOf(['none', 'electron', 'browser', 'manual']),
  cookiesPath: str,
  cookiesBrowser: str,
  lastLogin: nullable(num)
};

const UPDATES_FIELDS: Record<string, Sanitizer> = {
  autoCheck: bool,
  checkInterval: enumOf(['startup', 'hourly', 'daily', 'weekly'])
};

const TOAST_FIELDS: Record<string, Sanitizer> = {
  position: enumOf(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  showInfo: bool,
  showSuccess: bool,
  showWarning: bool,
  showNative: bool
};

const DEPENDENCY_FIELDS: Record<string, Sanitizer> = {
  name: str,
  installed: bool,
  version: nullable(str),
  checkedAt: nullable(num),
  path: nullable(str),
  managed: bool,
  latestVersion: nullable(str),
  updateAvailable: bool
};

const STATUS_BAR_SECTIONS = [
  'playing',
  'separator',
  'viewCounts',
  'downloads',
  'youtube',
  'dependencies',
  'version',
  'clock'
] as const;

const STATUS_BAR_FIELDS: Record<string, Sanitizer> = {
  visible: bool,
  sections: arrayOf(enumOf(STATUS_BAR_SECTIONS))
};

const HOME_SECTIONS = [
  'continue',
  'recent',
  'mostPlayed',
  'favorites',
  'playlists',
  'albums',
  'artists'
] as const;

const HOME_FIELDS: Record<string, Sanitizer> = {
  sections: arrayOf(enumOf(HOME_SECTIONS))
};

const TOP_LEVEL: Record<string, Sanitizer> = {
  version: num,
  general: obj(GENERAL_FIELDS),
  appearance: (v) => obj(APPEARANCE_FIELDS)(migrateAppearance(v)),
  playback: obj(PLAYBACK_FIELDS),
  explorer: obj(EXPLORER_FIELDS),
  library: obj(LIBRARY_FIELDS),
  download: obj(DOWNLOAD_FIELDS),
  shortcuts: stringRecord,
  network: obj(NETWORK_FIELDS),
  apiKeys: obj(API_KEYS_FIELDS),
  youtube: obj(YOUTUBE_FIELDS),
  updates: obj(UPDATES_FIELDS),
  toast: obj(TOAST_FIELDS),
  dependencies: recordOf(obj(DEPENDENCY_FIELDS)),
  statusBar: obj(STATUS_BAR_FIELDS),
  home: obj(HOME_FIELDS),
  favorites: stringArray
};

export const SETTINGS_ALLOWED_KEYS: readonly string[] = Object.freeze(Object.keys(TOP_LEVEL));

interface SanitizedSettings {
  sanitized: Partial<AppSettings>;
  droppedKeys: string[];
}

/**
 * Whitelist + walidacja typów dla ładunków ustawień przychodzących z renderera
 * (settings:set) lub z importowanych plików JSON (settings:import). Nieznane klucze i
 * wartości złego typu są odrzucane — nigdy nie trafiają do electron-store.
 * Wartości sekretów kluczy API są tu traktowane jako nieprzezroczyste stringi; szyfrowanie odbywa się
 * w handlerach przez settings-crypto.
 */
export function sanitizeSettings(raw: unknown): SanitizedSettings {
  if (!isPlainObject(raw)) return { sanitized: {}, droppedKeys: ['(root)'] };
  const migrated = migrateSettingsPayload(raw);
  const sanitized: Record<string, unknown> = {};
  const droppedKeys: string[] = [];
  for (const [key, value] of Object.entries(migrated)) {
    const fn = TOP_LEVEL[key];
    if (!fn) {
      droppedKeys.push(key);
      continue;
    }
    const cleaned = fn(value);
    if (cleaned === undefined) {
      droppedKeys.push(key);
    } else {
      sanitized[key] = cleaned;
    }
  }
  // Zawsze wbijaj wersję schematu, niezależnie od tego, co przysłał wywołujący, aby
  // zapisany ładunek niósł wersję, z którą aplikacja go zapisała.
  sanitized.version = SETTINGS_VERSION;
  return { sanitized: sanitized as Partial<AppSettings>, droppedKeys };
}
