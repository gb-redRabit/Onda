import type { MediaFile } from '@renderer/types/media';

// Pure plugin UI helpers extracted from `stores/plugins.ts` (plan 2.8). The
// store re-exports them so components and composables stay unchanged.

// Audio-view layout elements a plugin may decorate (`element.decoration`).
export const LAYOUT_ELEMENT_IDS = [
  'cover',
  'visualization',
  'progress',
  'trackInfo',
  'controls'
] as const;

/**
 * Host-renderowane warianty deklarowane przez wtyczki. Wartość dekoracji
 * zapisuje się jako `plugin:<element>:<variant>`. Host zna tylko te warianty —
 * pluginowy wariant spoza tej mapy nie nada stylu (bezpieczny fallback).
 * Renderowanie wariantu żyje przy elemencie (dla `cover` — clip-path w
 * `AudioCover.vue`); dodanie wariantu wymaga wpisu tutaj ORAZ implementacji.
 */
export const PLUGIN_HOST_VARIANTS: Record<string, readonly string[]> = {
  cover: ['triangle', 'circle', 'diamond', 'hexagon', 'flip-x']
};

export const PLUGIN_VISUAL_KEY = 'element.decoration';

export function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export interface TrackSnapshot {
  id: string;
  path: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  isOnline: boolean;
  platform?: string;
}

export function snapshotTrack(track: MediaFile | null): TrackSnapshot | null {
  if (!track) return null;
  const title = track.metadata?.title || track.name;
  return {
    id: track.id,
    path: track.path,
    title,
    artist: track.metadata?.artist,
    album: track.metadata?.album,
    duration: track.metadata?.duration ?? track.duration,
    isOnline: track.type === 'stream'
  };
}

export function validateShortcut(shortcut: string | undefined): boolean {
  if (!shortcut) return true;
  const parts = shortcut.split('+').map((p) => p.trim());
  if (parts.length < 2) return false;
  const modifiers = parts.slice(0, -1);
  const key = parts[parts.length - 1];
  if (modifiers.length === 0) return false;
  if (modifiers.some((m) => !['Ctrl', 'Meta', 'Alt', 'Shift'].includes(m))) return false;
  if (!/^[A-Z0-9]|^(F\d{1,2}|Media\w+)$/i.test(key)) return false;
  const seen = new Set<string>();
  return modifiers.every((m) => (seen.has(m) ? false : (seen.add(m), true)));
}
