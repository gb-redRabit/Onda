import type { Component } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { Clock, Flame, Heart, HeartOff, ImageOff, Music4, Sparkles } from '@lucide/vue';

// Wirtualne foldery biblioteki: nie przechowują listy utworów, tylko regułę liczoną
// na bieżąco z metadanych i statystyk odtwarzania. Czysta logika (bez store'ów), aby dało
// się ją testować bez montowania komponentów.

export type SmartFolderId =
  'unplayed' | 'favorites' | 'favoritesNoCover' | 'noCover' | 'recent' | 'mostPlayed' | 'lossless';

export interface SmartFolderContext {
  /** Ścieżki ulubionych utworów (`settings.favorites`). */
  favorites: ReadonlySet<string>;
  /** Znacznik „teraz" — wstrzykiwany, żeby reguły czasowe były testowalne. */
  now: number;
}

export interface SmartFolderDef {
  id: SmartFolderId;
  labelKey: string;
  icon: Component;
  match: (track: MediaFile, ctx: SmartFolderContext) => boolean;
  /** Sortowanie wyniku (opcjonalne); mutuje już przefiltrowaną, świeżą tablicę. */
  sort?: (a: MediaFile, b: MediaFile) => number;
}

export const RECENT_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

/** Utwór ma okładkę, jeśli ma miniaturę albo wbudowany obraz w metadanych. */
export function hasCover(track: MediaFile): boolean {
  return !!track.thumbnail || (track.metadata?.picture?.length ?? 0) > 0;
}

export const SMART_FOLDERS: readonly SmartFolderDef[] = [
  {
    id: 'unplayed',
    labelKey: 'library.smartFolders.unplayed',
    icon: Music4,
    match: (t) => (t.playCount ?? 0) === 0
  },
  {
    id: 'favorites',
    labelKey: 'library.smartFolders.favorites',
    icon: Heart,
    match: (t, ctx) => ctx.favorites.has(t.path)
  },
  {
    id: 'favoritesNoCover',
    labelKey: 'library.smartFolders.favoritesNoCover',
    icon: HeartOff,
    match: (t, ctx) => ctx.favorites.has(t.path) && !hasCover(t)
  },
  {
    id: 'noCover',
    labelKey: 'library.smartFolders.noCover',
    icon: ImageOff,
    match: (t) => !hasCover(t)
  },
  {
    id: 'recent',
    labelKey: 'library.smartFolders.recent',
    icon: Clock,
    match: (t, ctx) => ctx.now - t.addedAt < RECENT_WINDOW_DAYS * DAY_MS,
    sort: (a, b) => b.addedAt - a.addedAt
  },
  {
    id: 'mostPlayed',
    labelKey: 'library.smartFolders.mostPlayed',
    icon: Flame,
    match: (t) => (t.playCount ?? 0) > 0,
    sort: (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)
  },
  {
    id: 'lossless',
    labelKey: 'library.smartFolders.lossless',
    icon: Sparkles,
    match: (t) => t.metadata?.lossless === true
  }
];

export function getSmartFolder(id: SmartFolderId): SmartFolderDef | undefined {
  return SMART_FOLDERS.find((f) => f.id === id);
}

// Smart foldery to widoki MUZYCZNE — wideo i obrazki nie należą tutaj (obrazki i tak nie są
// odtwarzalne, a wideo ma osobną zakładkę), więc każda reguła działa tylko na audio.
function matchesFolder(def: SmartFolderDef, track: MediaFile, ctx: SmartFolderContext): boolean {
  return track.type === 'audio' && def.match(track, ctx);
}

/** Utwory pasujące do wirtualnego folderu (posortowane, jeśli folder ma `sort`). */
export function filterSmartFolder(
  id: SmartFolderId,
  tracks: readonly MediaFile[],
  ctx: SmartFolderContext
): MediaFile[] {
  const def = getSmartFolder(id);
  if (!def) return [];
  const out = tracks.filter((t) => matchesFolder(def, t, ctx));
  return def.sort ? out.sort(def.sort) : out;
}

export function countSmartFolder(
  id: SmartFolderId,
  tracks: readonly MediaFile[],
  ctx: SmartFolderContext
): number {
  const def = getSmartFolder(id);
  if (!def) return 0;
  let n = 0;
  for (const t of tracks) if (matchesFolder(def, t, ctx)) n += 1;
  return n;
}
