import type { Ref, ShallowRef } from 'vue';
import { logger } from '@shared/logger';
import type { MediaFile, Playlist } from '@renderer/types/media';
import type { LibraryUpdatedPayload } from '@shared/types/ipc/channels-library';

export interface LibraryWatchDeps {
  isLoaded: Ref<boolean>;
  tracks: ShallowRef<MediaFile[]>;
  folderTypes: Ref<Record<string, 'audio' | 'video' | 'image' | 'mixed'>>;
  playlists: Ref<Playlist[]>;
  scheduleLoadTracksAsync: () => Promise<void>;
}

// Okablowanie zdarzeń biblioteki z procesu main wyodrębnione z `stores/library.ts` (plan 2.8):
// odświeżanie przy ponownym skanowaniu i wsadowa obsługa `library:fileMissing` (plan 1.4).
export function createLibraryWatch(deps: LibraryWatchDeps) {
  const { isLoaded, tracks, folderTypes, playlists, scheduleLoadTracksAsync } = deps;
  let subscribedToLibraryUpdates = false;

  /** Scala patch biblioteki bez ponownego czytania wszystkich porcji z main. */
  function applyLibraryPatch(payload: LibraryUpdatedPayload): void {
    const removed = Array.isArray(payload.removed) ? payload.removed : [];
    const updated = Array.isArray(payload.updated) ? payload.updated : [];
    const added = Array.isArray(payload.added) ? payload.added : [];
    if (removed.length === 0 && updated.length === 0 && added.length === 0) {
      if (payload.folderTypes) folderTypes.value = { ...folderTypes.value, ...payload.folderTypes };
      return;
    }

    const byPath = new Map(tracks.value.map((item) => [item.path, item]));
    for (const path of removed) byPath.delete(path);
    for (const item of updated) byPath.set(item.path, item as MediaFile);
    for (const item of added) byPath.set(item.path, item as MediaFile);
    tracks.value = [...byPath.values()];
    if (payload.folderTypes) folderTypes.value = { ...folderTypes.value, ...payload.folderTypes };
  }
  let pendingMissing = new Set<string>();
  let missingTimer: ReturnType<typeof setTimeout> | null = null;

  // Ponownie odczytaj playlisty z dysku (mogą zostać zmienione przez funkcję
  // automatycznej playlisty kanału w procesie main po pobraniu).
  async function reloadPlaylists() {
    try {
      const list = (await window.api?.invoke('playlist:loadAll')) as Playlist[] | undefined;
      if (list) playlists.value = list;
    } catch {
      /* playlisty niedostępne */
    }
  }

  // Odśwież listę utworów, gdy proces main ponownie przeskanował folder biblioteki
  // (np. po tym, jak zakończone pobieranie trafiło do folderu biblioteki).
  function subscribeLibraryUpdates() {
    if (subscribedToLibraryUpdates) return;
    subscribedToLibraryUpdates = true;
    window.api?.on('library:updated', (...args: unknown[]) => {
      const patch = args[0] as LibraryUpdatedPayload | undefined;
      if (isLoaded.value) {
        // Brak ładunku lub `reset` = stara/pełna ścieżka. Patch aktualizuje tylko
        // zmienione wpisy, więc pobieranie całej biblioteki jest zbędne.
        if (!patch || patch.reset === true) void scheduleLoadTracksAsync();
        else applyLibraryPatch(patch);
      }
      void reloadPlaylists();
    });
    // Wsadowo obsługuj zdarzenia brakujących plików: proces main zgłasza jedno zdarzenie na plik, a
    // każde wyzwalało pełny filtr tablicy + clone + zapis (O(n²), gdy znika cały
    // dysk — plan 1.4).
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
          // Patch z samymi ścieżkami: main usuwa je ze swojej kopii, bez
          // przesyłania i ryzykowania nadpisania całej biblioteki.
          const warn = (e: unknown): void =>
            logger.warn('library', 'failed to persist scanned library after missing files', e);
          try {
            const request = window.api?.invoke('library:saveScanned', {
              removePaths: [...toRemove]
            });
            void request?.catch(warn);
          } catch (e) {
            warn(e);
          }
        }
      }, 300);
    });
  }

  return { reloadPlaylists, subscribeLibraryUpdates };
}
