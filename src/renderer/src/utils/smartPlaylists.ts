import type { MediaFile } from '@shared/types/media';
import type {
  SmartPlaylist,
  SmartPlaylistField,
  SmartPlaylistOperator,
  SmartPlaylistRule,
  SmartPlaylistSort,
  SmartPlaylistValue
} from '@shared/types/smart-playlist';
import { hasCover } from './smartFolders';

const DAY_MS = 86_400_000;

export interface SmartPlaylistContext {
  favorites: ReadonlySet<string>;
  now: number;
}

export type SmartFieldType = 'text' | 'number' | 'boolean' | 'date';

export interface SmartFieldDef {
  field: SmartPlaylistField;
  type: SmartFieldType;
  labelKey: string;
  operators: SmartPlaylistOperator[];
  defaultValue: SmartPlaylistValue;
}

export const SMART_FIELD_DEFS: readonly SmartFieldDef[] = [
  {
    field: 'title',
    type: 'text',
    labelKey: 'library.smartPlaylists.fields.title',
    operators: ['contains', 'equals', 'notEquals'],
    defaultValue: ''
  },
  {
    field: 'artist',
    type: 'text',
    labelKey: 'library.smartPlaylists.fields.artist',
    operators: ['contains', 'equals', 'notEquals'],
    defaultValue: ''
  },
  {
    field: 'album',
    type: 'text',
    labelKey: 'library.smartPlaylists.fields.album',
    operators: ['contains', 'equals', 'notEquals'],
    defaultValue: ''
  },
  {
    field: 'genre',
    type: 'text',
    labelKey: 'library.smartPlaylists.fields.genre',
    operators: ['contains', 'equals', 'notEquals'],
    defaultValue: ''
  },
  {
    field: 'year',
    type: 'number',
    labelKey: 'library.smartPlaylists.fields.year',
    operators: ['gte', 'lte', 'between'],
    defaultValue: 2000
  },
  {
    field: 'duration',
    type: 'number',
    labelKey: 'library.smartPlaylists.fields.duration',
    operators: ['gte', 'lte', 'between'],
    defaultValue: 0
  },
  {
    field: 'bitrate',
    type: 'number',
    labelKey: 'library.smartPlaylists.fields.bitrate',
    operators: ['gte', 'lte', 'between'],
    defaultValue: 0
  },
  {
    field: 'playCount',
    type: 'number',
    labelKey: 'library.smartPlaylists.fields.playCount',
    operators: ['gte', 'lte', 'between'],
    defaultValue: 1
  },
  {
    field: 'lossless',
    type: 'boolean',
    labelKey: 'library.smartPlaylists.fields.lossless',
    operators: ['isTrue', 'isFalse'],
    defaultValue: true
  },
  {
    field: 'hasCover',
    type: 'boolean',
    labelKey: 'library.smartPlaylists.fields.hasCover',
    operators: ['isTrue', 'isFalse'],
    defaultValue: true
  },
  {
    field: 'favorite',
    type: 'boolean',
    labelKey: 'library.smartPlaylists.fields.favorite',
    operators: ['isTrue', 'isFalse'],
    defaultValue: true
  },
  {
    field: 'addedAt',
    type: 'date',
    labelKey: 'library.smartPlaylists.fields.addedAt',
    operators: ['withinLastDays', 'olderThanDays'],
    defaultValue: 30
  },
  {
    field: 'lastPlayed',
    type: 'date',
    labelKey: 'library.smartPlaylists.fields.lastPlayed',
    operators: ['withinLastDays', 'olderThanDays', 'never'],
    defaultValue: 30
  },
  {
    field: 'path',
    type: 'text',
    labelKey: 'library.smartPlaylists.fields.path',
    operators: ['contains', 'equals', 'notEquals'],
    defaultValue: ''
  }
];

export const SMART_OPERATOR_DEFS: Record<
  SmartPlaylistOperator,
  { labelKey: string; needsValue: boolean }
> = {
  contains: { labelKey: 'library.smartPlaylists.operators.contains', needsValue: true },
  equals: { labelKey: 'library.smartPlaylists.operators.equals', needsValue: true },
  notEquals: { labelKey: 'library.smartPlaylists.operators.notEquals', needsValue: true },
  gte: { labelKey: 'library.smartPlaylists.operators.gte', needsValue: true },
  lte: { labelKey: 'library.smartPlaylists.operators.lte', needsValue: true },
  between: { labelKey: 'library.smartPlaylists.operators.between', needsValue: true },
  isTrue: { labelKey: 'library.smartPlaylists.operators.isTrue', needsValue: false },
  isFalse: { labelKey: 'library.smartPlaylists.operators.isFalse', needsValue: false },
  withinLastDays: {
    labelKey: 'library.smartPlaylists.operators.withinLastDays',
    needsValue: true
  },
  olderThanDays: { labelKey: 'library.smartPlaylists.operators.olderThanDays', needsValue: true },
  never: { labelKey: 'library.smartPlaylists.operators.never', needsValue: false }
};

export const SMART_SORT_KEYS: readonly SmartPlaylistSort[] = [
  'title',
  'artist',
  'album',
  'year',
  'duration',
  'addedAt',
  'lastPlayed',
  'playCount'
];

export const SMART_SORT_LABEL_KEYS: Record<SmartPlaylistSort, string> = {
  title: 'library.smartPlaylists.fields.title',
  artist: 'library.smartPlaylists.fields.artist',
  album: 'library.smartPlaylists.fields.album',
  year: 'library.smartPlaylists.fields.year',
  duration: 'library.smartPlaylists.fields.duration',
  addedAt: 'library.smartPlaylists.fields.addedAt',
  lastPlayed: 'library.smartPlaylists.fields.lastPlayed',
  playCount: 'library.smartPlaylists.fields.playCount'
};

export function fieldDef(field: SmartPlaylistField): SmartFieldDef | undefined {
  return SMART_FIELD_DEFS.find((d) => d.field === field);
}

function textValue(track: MediaFile, field: SmartPlaylistField): string {
  const meta = track.metadata;
  switch (field) {
    case 'title':
      return meta?.title || track.name;
    case 'artist':
      return meta?.artist || '';
    case 'album':
      return meta?.album || '';
    case 'genre':
      return meta?.genre || '';
    case 'path':
      return track.path;
    default:
      return '';
  }
}

function numberValue(track: MediaFile, field: SmartPlaylistField): number {
  switch (field) {
    case 'year':
      return track.metadata?.year ?? 0;
    case 'duration':
      return track.duration ?? 0;
    case 'bitrate':
      return track.metadata?.bitrate ?? 0;
    case 'playCount':
      return track.playCount ?? 0;
    case 'addedAt':
      return track.addedAt ?? 0;
    case 'lastPlayed':
      return track.lastPlayed ?? 0;
    default:
      return 0;
  }
}

function booleanValue(
  track: MediaFile,
  field: SmartPlaylistField,
  ctx: SmartPlaylistContext
): boolean {
  switch (field) {
    case 'lossless':
      return track.metadata?.lossless === true;
    case 'hasCover':
      return hasCover(track);
    case 'favorite':
      return ctx.favorites.has(track.path);
    default:
      return false;
  }
}

function compareNumber(
  actual: number,
  operator: SmartPlaylistOperator,
  value: SmartPlaylistValue
): boolean {
  if (operator === 'between') {
    if (!Array.isArray(value)) return false;
    const [min, max] = value;
    return actual >= Number(min) && actual <= Number(max);
  }
  const target = Number(value);
  if (!Number.isFinite(target)) return false;
  if (operator === 'gte') return actual >= target;
  if (operator === 'lte') return actual <= target;
  return false;
}

function matchesDate(
  timestamp: number,
  operator: SmartPlaylistOperator,
  value: SmartPlaylistValue,
  now: number
): boolean {
  if (operator === 'never') return !timestamp;
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) return false;
  if (!timestamp) return false;
  const age = now - timestamp;
  if (operator === 'withinLastDays') return age <= days * DAY_MS;
  if (operator === 'olderThanDays') return age > days * DAY_MS;
  return false;
}

export function ruleMatches(
  track: MediaFile,
  rule: SmartPlaylistRule,
  ctx: SmartPlaylistContext
): boolean {
  if (!rule || !fieldDef(rule.field)) return false;
  const def = fieldDef(rule.field)!;
  if (!def.operators.includes(rule.operator)) return false;

  if (def.type === 'text') {
    const actual = textValue(track, rule.field).toLowerCase();
    const expected = String(rule.value ?? '').toLowerCase();
    if (rule.operator === 'contains') return actual.includes(expected);
    if (rule.operator === 'equals') return actual === expected;
    if (rule.operator === 'notEquals') return actual !== expected;
    return false;
  }

  if (def.type === 'number') {
    return compareNumber(numberValue(track, rule.field), rule.operator, rule.value);
  }

  if (def.type === 'boolean') {
    const actual = booleanValue(track, rule.field, ctx);
    if (rule.operator === 'isTrue') return actual;
    if (rule.operator === 'isFalse') return !actual;
    return false;
  }

  return matchesDate(numberValue(track, rule.field), rule.operator, rule.value, ctx.now);
}

export function matchesSmartPlaylist(
  track: MediaFile,
  playlist: Pick<SmartPlaylist, 'match' | 'rules'>,
  ctx: SmartPlaylistContext
): boolean {
  if (track.type !== 'audio') return false;
  if (!playlist.rules.length) return false;
  const results = playlist.rules.map((rule) => ruleMatches(track, rule, ctx));
  return playlist.match === 'all' ? results.every(Boolean) : results.some(Boolean);
}

function sortValue(track: MediaFile, sort: SmartPlaylistSort): string | number {
  switch (sort) {
    case 'title':
      return (track.metadata?.title || track.name).toLowerCase();
    case 'artist':
      return (track.metadata?.artist || '').toLowerCase();
    case 'album':
      return (track.metadata?.album || '').toLowerCase();
    default:
      return numberValue(track, sort);
  }
}

export function resolveSmartPlaylist(
  playlist: SmartPlaylist,
  tracks: readonly MediaFile[],
  ctx: SmartPlaylistContext
): MediaFile[] {
  const matched = tracks.filter((track) => matchesSmartPlaylist(track, playlist, ctx));
  const sort = playlist.sort;
  if (sort) {
    const dir =
      (playlist.sortDir ??
        (sort === 'title' || sort === 'artist' || sort === 'album' ? 'asc' : 'desc')) === 'asc'
        ? 1
        : -1;
    matched.sort((a, b) => {
      const va = sortValue(a, sort);
      const vb = sortValue(b, sort);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return (va - vb) * dir;
    });
  }
  const limit = Math.floor(playlist.limit ?? 0);
  return limit > 0 ? matched.slice(0, limit) : matched;
}

export function countSmartPlaylist(
  playlist: SmartPlaylist,
  tracks: readonly MediaFile[],
  ctx: SmartPlaylistContext
): number {
  let count = 0;
  for (const track of tracks) {
    if (matchesSmartPlaylist(track, playlist, ctx)) count += 1;
  }
  return count;
}

export interface SmartPlaylistTemplate {
  key: string;
  labelKey: string;
  build: () => Pick<SmartPlaylist, 'match' | 'rules' | 'sort' | 'sortDir' | 'limit'>;
}

export const SMART_PLAYLIST_TEMPLATES: readonly SmartPlaylistTemplate[] = [
  {
    key: 'mostPlayed',
    labelKey: 'library.smartPlaylists.templates.mostPlayed',
    build: () => ({
      match: 'all',
      rules: [{ field: 'playCount', operator: 'gte', value: 1 }],
      sort: 'playCount',
      sortDir: 'desc',
      limit: 100
    })
  },
  {
    key: 'favorites',
    labelKey: 'library.smartPlaylists.templates.favorites',
    build: () => ({
      match: 'all',
      rules: [{ field: 'favorite', operator: 'isTrue', value: true }],
      sort: 'title',
      sortDir: 'asc'
    })
  },
  {
    key: 'jazz',
    labelKey: 'library.smartPlaylists.templates.jazz',
    build: () => ({
      match: 'all',
      rules: [{ field: 'genre', operator: 'contains', value: 'Jazz' }],
      sort: 'artist',
      sortDir: 'asc'
    })
  },
  {
    key: 'noCover',
    labelKey: 'library.smartPlaylists.templates.noCover',
    build: () => ({
      match: 'all',
      rules: [{ field: 'hasCover', operator: 'isFalse', value: false }],
      sort: 'title',
      sortDir: 'asc'
    })
  }
];
