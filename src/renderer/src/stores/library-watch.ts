import type { Ref, ShallowRef } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';

export interface LibraryWatchDeps {
  isLoaded: Ref<boolean>;
  tracks: ShallowRef<MediaFile[]>;
  folderTypes: Ref<Record<string, 'audio' | 'video' | 'image' | 'mixed'>>;
  playlists: Ref<Playlist[]>;
  scheduleLoadTracksAsync: () => Promise<void>;
  invalidateDerivedCache: () => void;
}

// Main-process library event wiring extracted from `stores/library.ts` (plan 2.8):
// refresh on re-scan and the batched `library:fileMissing` handling (plan 1.4).
export function createLibraryWatch(deps: LibraryWatchDeps) {
  const {
    isLoaded,
    tracks,
    folderTypes,
    playlists,
    scheduleLoadTracksAsync,
    invalidateDerivedCache
  } = deps;
  let subscribedToLibraryUpdates = false;
  let pendingMissing = new Set<string>();
  let missingTimer: ReturnType<typeof setTimeout> | null = null;

  // Re-read playlists from disk (they can be changed by the auto channel
  // playlist feature in the main process after a download).
  async function reloadPlaylists() {
    try {
      const list = (await window.api?.invoke('playlist:loadAll')) as Playlist[] | undefined;
      if (list) playlists.value = list;
    } catch {
      /* playlists unavailable */
    }
  }

  // Refresh the track list when the main process re-scanned a library folder
  // (e.g. after a finished download landed inside a library folder).
  function subscribeLibraryUpdates() {
    if (subscribedToLibraryUpdates) return;
    subscribedToLibraryUpdates = true;
    window.api?.on('library:updated', () => {
      if (isLoaded.value) void scheduleLoadTracksAsync();
      void reloadPlaylists();
    });
    // Batch missing-file events: the main process reports one event per file, and
    // each used to trigger a full array filter + clone + save (O(n²) when a whole
    // drive disappears — plan 1.4).
    window.api?.on('library:fileMissing', (...args: unknown[]) => {
      const p = args[0] as string | undefined;
      if (typeof p !== 'string' || !p) return;
      pendingMissing.add(p);
      if (missingTimer) return;
      missingTimer = setTimeout(() => {
        missingTimer = null;
        const toRemove = pendingMissing;
        pendingMissing = new Set();
        const before = tracks.value.length;
        tracks.value = tracks.value.filter((t) => !toRemove.has(t.path));
        if (tracks.value.length !== before) {
          invalidateDerivedCache();
          // zapisz od razu żeby nie wracał po restarcie
          try {
            const files = JSON.parse(JSON.stringify(tracks.value));
            window.api?.invoke('library:saveScanned', { files, folderTypes: folderTypes.value });
          } catch {
            /* best-effort: intentionally ignored (non-fatal) */
          }
        }
      }, 300);
    });
  }

  return { reloadPlaylists, subscribeLibraryUpdates };
}
