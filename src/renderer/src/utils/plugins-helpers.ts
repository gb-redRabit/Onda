import type { MediaFile } from '@renderer/types/media';

// Pure plugin UI helpers extracted from `stores/plugins.ts` (plan 2.8). The
// store re-exports them so components and composables stay unchanged.

export const ELEMENT_DECORATIONS: Record<string, string[]> = {
  cover: ['none', 'triangle', 'circle', 'diamond', 'hexagon'],
  visualization: ['none', 'outline', 'glow', 'glass'],
  progress: ['none', 'glow', 'neon'],
  trackInfo: ['none', 'badge', 'glass', 'glow'],
  controls: ['none', 'glass', 'glow']
};

/**
 * Host-renderowane warianty deklarowane przez wtyczki (rozszerzenie dekoracji).
 * Wartość w dekoracji zapisuje się jako `plugin:<element>:<variant>`. Host zna tylko
 * te warianty, więc pluginowy wariant spoza tej mapy w edytorze się pokaże, ale nie
 * nada żadnego stylu (bezpieczny fallback). Pierwszy wpis = wariant hosta, który łączy
 * się z elementem za pomocą klasy/clip-path.
 */
export const PLUGIN_HOST_VARIANTS: Record<string, Record<string, string>> = {
  cover: {
    'flip-x': 'plugin-cover-flip-x'
  }
};

export const PLUGIN_VISUAL_KEY = 'element.decoration';

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
