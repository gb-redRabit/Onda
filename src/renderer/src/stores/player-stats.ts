import type { MediaFile } from '@renderer/types/media';
import { useLibraryStore } from './library';

export function usePlayerStats() {
  let statsSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function persistStats() {
    if (statsSaveTimer) return;
    statsSaveTimer = setTimeout(() => {
      statsSaveTimer = null;
      try {
        const library = useLibraryStore();
        const files = structuredClone(library.tracks);
        const folderTypes = structuredClone(library.folderTypes);
        window.api?.invoke('library:saveScanned', { files, folderTypes }).catch(() => {
          /* non-fatal */
        });
      } catch {
        /* serialization failed silently */
      }
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
    if (found) persistStats();
  }

  return { recordPlay };
}
