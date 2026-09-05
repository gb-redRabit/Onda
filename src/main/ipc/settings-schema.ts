import type { AppSettings } from '../../renderer/src/types/settings';

type Sanitizer = (value: unknown) => unknown | undefined;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function str(v: unknown): unknown | undefined {
  return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): unknown | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function numClamped(min: number, max: number): Sanitizer {
  return (v) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
}
function bool(v: unknown): unknown | undefined {
  return typeof v === 'boolean' ? v : undefined;
}
function enumOf(values: readonly string[]): Sanitizer {
  return (v) => (typeof v === 'string' && values.includes(v) ? v : undefined);
}
function nullable(inner: Sanitizer): Sanitizer {
  return (v) => (v === null ? null : inner(v));
}
function obj(fields: Record<string, Sanitizer>): Sanitizer {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, fn] of Object.entries(fields)) {
      if (key in v) {
        const cleaned = fn(v[key]);
        if (cleaned !== undefined) out[key] = cleaned;
      }
    }
    return out;
  };
}
function stringRecord(v: unknown): unknown | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
function primitiveRecord(v: unknown): unknown | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}
function recordOf(item: Sanitizer): Sanitizer {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(v)) {
      const cleaned = item(value);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  };
}
function arrayOf(item: Sanitizer): Sanitizer {
  return (v) => {
    if (!Array.isArray(v)) return undefined;
    const out: unknown[] = [];
    for (const value of v) {
      const cleaned = item(value);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  };
}
function stringArray(v: unknown): unknown | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string') out.push(x);
  }
  return out;
}
function viewModes(v: unknown): unknown | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, 'list' | 'grid'> = {};
  for (const [key, value] of Object.entries(v)) {
    if (value === 'list' || value === 'grid') out[key] = value;
  }
  return out;
}

function hexStr(v: unknown): unknown | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/.test(s) ? s : undefined;
}

function zeroOne(v: unknown): unknown | undefined {
  return v === 0 || v === 1 ? v : undefined;
}

function sizeMultiplier(v: unknown): unknown | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = v > 5 ? Math.round(v / 2) : Math.round(v);
  return Math.min(5, Math.max(1, n));
}

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

const AUDIO_PIP_DOCKS = ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
const AUDIO_PIP_ELEMENTS = ['cover', 'trackInfo', 'controls', 'progress', 'volume', 'viz', 'nextTrack', 'eq'] as const;

function pipElementArray(v: unknown): unknown | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [];
  for (const x of v) {
    if (typeof x === 'string' && (AUDIO_PIP_ELEMENTS as readonly string[]).includes(x)) out.push(x);
  }
  return out;
}

function migrateAppearance(v: unknown): unknown {
  if (!isPlainObject(v)) return v;
  const src = v as Record<string, unknown>;
  let out: Record<string, unknown> = src;
  const acc = src['accentColor'];
  const cc = src['customColors'];
  if (
    typeof acc === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(acc) &&
    !(isPlainObject(cc) && typeof cc['primary'] === 'string')
  ) {
    out = { ...out, customColors: { ...(isPlainObject(cc) ? cc : {}), primary: acc } };
  }
  // Migracja starego modelu 4 trybów -> jeden adaptacyjny dock.
  // Uzupełniamy TYLKO gdy payload zawiera jakiekolwiek klucze PiP (nie psujemy toEqual w testach).
  const hasPipKeys = [
    'audioPipDock',
    'audioPipMode',
    'audioPipPosition',
    'audioPipEdgePosition',
    'audioPipCornerElements',
    'audioPipEdgeElements',
    'audioPipAutoHide',
    'audioPipAutoShow',
    'audioPipOpacity'
  ].some((k) => k in out);
  if (!hasPipKeys) return out;
  out = { ...out };
  if (!('audioPipDock' in out) || typeof out['audioPipDock'] !== 'string') {
    const mode = src['audioPipMode'];
    const pos = src['audioPipPosition'];
    const edge = src['audioPipEdgePosition'];
    if (mode === 'wide' || mode === 'max') {
      out['audioPipDock'] = edge === 'top' ? 'top' : 'bottom';
    } else if (typeof pos === 'string' && (AUDIO_PIP_DOCKS as readonly string[]).includes(pos)) {
      out['audioPipDock'] = pos as (typeof AUDIO_PIP_DOCKS)[number];
    } else {
      out['audioPipDock'] = 'bottom-right';
    }
  }
  if (!('audioPipCornerElements' in out)) {
    out['audioPipCornerElements'] = ['cover', 'trackInfo', 'controls', 'progress', 'volume'];
  }
  if (!('audioPipEdgeElements' in out)) {
    out['audioPipEdgeElements'] = ['cover', 'trackInfo', 'controls', 'progress', 'volume', 'viz'];
  }
  if (!('audioPipAutoHide' in out)) out['audioPipAutoHide'] = true;
  return out;
}

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
  audioPipDock: enumOf(['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']),
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
  defaultPlayer: enumOf(['html5', 'vlc']),
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
  // cursorTimeout jest w SEKUNDACH (renderer używa czas * 1000; slider 1–10 s)
  cursorTimeout: numClamped(1, 30),
  playbackSpeed: numClamped(0.2, 3),
  videoFilter: str,
  visualization: obj(VISUALIZATION_FIELDS),
  crossfadeSeconds: numClamped(0, 12),
  streamPreloadSeconds: numClamped(0, 60),
  perSourceVolume: bool,
  autoResume: bool,
  sleepTimerMinutes: numClamped(0, 240)
};

const EXPLORER_FIELDS: Record<string, Sanitizer> = {
  viewMode: enumOf(['extraSmall', 'small', 'medium', 'large', 'extraLarge', 'details']),
  sortBy: enumOf(['name', 'size', 'type', 'modified']),
  sortOrder: enumOf(['asc', 'desc']),
  confirmBeforeMove: bool
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
  logLevel: enumOf(['debug', 'info', 'warn', 'error']),
  logMaxSizeMB: numClamped(1, 100),
  experimentalEnabled: bool
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

const TOP_LEVEL: Record<string, Sanitizer> = {
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
  favorites: stringArray
};

export const SETTINGS_ALLOWED_KEYS: readonly string[] = Object.freeze(Object.keys(TOP_LEVEL));

interface SanitizedSettings {
  sanitized: Partial<AppSettings>;
  droppedKeys: string[];
}

/**
 * Whitelist + type validation for settings payloads coming from the renderer
 * (settings:set) or from imported JSON files (settings:import). Unknown keys and
 * values of the wrong type are dropped — they never reach the electron-store.
 * API key secret values are treated as opaque strings here; encryption happens in
 * the handlers via settings-crypto.
 */
export function sanitizeSettings(raw: unknown): SanitizedSettings {
  if (!isPlainObject(raw)) return { sanitized: {}, droppedKeys: ['(root)'] };
  const sanitized: Record<string, unknown> = {};
  const droppedKeys: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
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
  return { sanitized: sanitized as Partial<AppSettings>, droppedKeys };
}
