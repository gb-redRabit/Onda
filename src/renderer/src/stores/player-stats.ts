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
    // Single lookup: `updateTrackStats` returns the updated track, so there is
    // no second O(n) `find` over a 50k array on every play.
    const updated = library.updateTrackStats(track.path, (t) => {
      t.playCount = (t.playCount || 0) + 1;
      t.lastPlayed = Date.now();
    });
    if (updated) {
      pendingStats.set(track.path, {
        playCount: updated.playCount,
        lastPlayed: updated.lastPlayed!
      });
      persistStats();
    }
  }

  return { recordPlay };
}
