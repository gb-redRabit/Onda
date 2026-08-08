import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from './library';

export function usePlayerStats() {
  let statsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingStats = new Map<string, { playCount: number; lastPlayed: number }>();

  function persistStats() {
    if (statsSaveTimer) return;
    statsSaveTimer = setTimeout(() => {
      statsSaveTimer = null;
      if (pendingStats.size === 0) return;
      const stats = Array.from(pendingStats.entries()).map(([path, s]) => ({
        path,
        playCount: s.playCount,
        lastPlayed: s.lastPlayed
      }));
      pendingStats.clear();
      window.api?.invoke('library:updateStats', stats).catch(() => {
        /* non-fatal */
      });
    }, 1000);
  }

  function recordPlay(track: MediaFile) {
    if (!track?.path) return;
    const library = useLibraryStore();
    let found = false;
    library.updateTrack(track.path, (t) => {
      t.playCount = (t.playCount || 0) + 1;
      t.lastPlayed = Date.now();
      found = true;
    });
    if (found) {
      const t = library.tracks.find((x) => x.path === track.path);
      if (t) {
        pendingStats.set(track.path, { playCount: t.playCount, lastPlayed: t.lastPlayed! });
      }
      persistStats();
    }
  }

  return { recordPlay };
}
