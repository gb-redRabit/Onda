import type { AppSettings } from '../../renderer/src/types/settings';

export type Sanitizer = (value: unknown) => unknown | undefined;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function str(v: unknown): unknown | undefined {
  return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): unknown | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
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

const APPEARANCE_FIELDS: Record<string, Sanitizer> = {
  theme: enumOf(['dark', 'light', 'midnight', 'spotify', 'custom']),
  accentColor: str,
  fontSize: num,
  density: enumOf(['compact', 'comfortable', 'spacious']),
  sidebarPosition: enumOf(['left', 'right']),
  sidebarCollapsed: bool,
  showPlaylists: bool,
  showAlbums: bool,
  locale: enumOf(['pl', 'en']),
  animations: bool,
  transparency: num,
  customBackground: str,
  audioPipMode: enumOf(['minimal', 'medium', 'max', 'wide']),
  audioPipAutoShow: bool,
  audioPipOpacity: num,
  audioPipPosition: enumOf(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  audioPipEdgePosition: enumOf(['top', 'bottom'])
};

const VISUALIZATION_FIELDS: Record<string, Sanitizer> = {
  mode: enumOf(['circle', 'bars', 'particles', 'wave', 'radial', 'none']),
  primaryColor: str,
  secondaryColor: str,
  sensitivity: num
};

const PLAYBACK_FIELDS: Record<string, Sanitizer> = {
  defaultPlayer: enumOf(['html5', 'vlc']),
  normalization: bool,
  replayGain: bool,
  gaplessPlayback: bool,
  autoPauseOnFocusLoss: bool,
  defaultVolume: num,
  rememberPosition: bool,
  pipPosition: enumOf(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  pipWidth: num,
  pipHeight: num,
  pipPreBuffer: bool,
  cursorHide: bool,
  cursorTimeout: num,
  playbackSpeed: num,
  videoFilter: str,
  visualization: obj(VISUALIZATION_FIELDS)
};

const EXPLORER_FIELDS: Record<string, Sanitizer> = {
  viewMode: enumOf(['extraSmall', 'small', 'medium', 'large', 'extraLarge', 'details']),
  sortBy: enumOf(['name', 'size', 'type', 'modified']),
  sortOrder: enumOf(['asc', 'desc']),
  confirmBeforeMove: bool
};

const LIBRARY_FIELDS: Record<string, Sanitizer> = {
  viewModes
};

const DOWNLOAD_FIELDS: Record<string, Sanitizer> = {
  defaultPath: str,
  defaultAudioFormat: enumOf(['mp3', 'flac', 'ogg', 'aac']),
  defaultVideoQuality: enumOf(['best', '1080p', '720p', '480p']),
  filenameTemplate: str,
  maxConcurrent: num,
  autoDownloadSubscriptions: bool,
  hashFiles: bool
};

const PROXY_FIELDS: Record<string, Sanitizer> = {
  enabled: bool,
  type: enumOf(['http', 'https', 'socks5']),
  host: str,
  port: num,
  username: str,
  password: str
};

const NETWORK_FIELDS: Record<string, Sanitizer> = {
  proxy: obj(PROXY_FIELDS),
  downloadSpeedLimit: num,
  userAgent: str
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

const UPDATES_FIELDS: Record<string, Sanitizer> = {
  autoCheck: bool,
  checkInterval: enumOf(['startup', 'hourly', 'daily', 'weekly'])
};

const TOAST_FIELDS: Record<string, Sanitizer> = {
  position: enumOf(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  showInfo: bool,
  showSuccess: bool,
  showWarning: bool
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

const TOP_LEVEL: Record<string, Sanitizer> = {
  appearance: obj(APPEARANCE_FIELDS),
  playback: obj(PLAYBACK_FIELDS),
  explorer: obj(EXPLORER_FIELDS),
  library: obj(LIBRARY_FIELDS),
  download: obj(DOWNLOAD_FIELDS),
  shortcuts: stringRecord,
  network: obj(NETWORK_FIELDS),
  apiKeys: obj(API_KEYS_FIELDS),
  updates: obj(UPDATES_FIELDS),
  toast: obj(TOAST_FIELDS),
  dependencies: recordOf(obj(DEPENDENCY_FIELDS)),
  favorites: stringArray
};

export const SETTINGS_ALLOWED_KEYS: readonly string[] = Object.freeze(Object.keys(TOP_LEVEL));

export interface SanitizedSettings {
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
