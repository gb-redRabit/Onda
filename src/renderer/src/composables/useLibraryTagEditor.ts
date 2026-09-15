import { ref } from 'vue';
import { logger } from '@shared/logger';
import type { useLibraryStore } from '@renderer/stores/library';
import type { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';

interface LibraryTagInput {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  track?: { no: number };
  name?: string;
  path?: string;
}

interface LibraryMbApplyData {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  track?: { no: number };
  coverData?: number[];
  coverMime?: string;
}

// structuredClone can reject reactive proxies / Uint8Array in the renderer �
// fall back to a JSON round-trip in that case.
function cloneOrJson<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
function persistScanned(library: ReturnType<typeof useLibraryStore>) {
  try {
    // używaj JSON jako fallback dla proxy / Uint8Array które structuredClone czasem odrzuca w rendererze
    const files = cloneOrJson(library.tracks);
    const folderTypes = cloneOrJson(library.folderTypes);
    window.api
      ?.invoke('library:saveScanned', { files, folderTypes })
      .catch((err) => logger.error('Library', 'saveScanned', err));
  } catch (_e) {
    /* serialization failed silently */
  }
}

export function useLibraryTagEditor(
  library: ReturnType<typeof useLibraryStore>,
  player: ReturnType<typeof usePlayerStore>
) {
  const editingTrack = ref<MediaFile | null>(null);
  const showingMBLookup = ref(false);

  function onTagSaved(tags: LibraryTagInput) {
    if (!editingTrack.value) return;
    const oldPath = editingTrack.value.path;
    library.updateTrack(
      oldPath,
      (track) => {
        track.metadata = {
          ...(track.metadata || {}),
          title: tags.title,
          artist: tags.artist,
          album: tags.album,
          year: tags.year,
          genre: tags.genre,
          track: tags.track
        };
        if (tags.name) {
          track.name = tags.name + (track.name.match(/\.[^.]+$/)?.[0] || '');
        }
        if (tags.path) {
          track.path = tags.path;
          track.id = tags.path;
        }
      },
      true
    );
    if (tags.path) {
      player.invalidateCoverCache(oldPath);
    }
    persistScanned(library);
  }

  function onMBApply(data: LibraryMbApplyData) {
    if (!editingTrack.value) return;
    const targetPath = editingTrack.value.path;
    // użyj updateTrack żeby triggerRef i cache invalidation zadziałały poprawnie
    library.updateTrack(
      targetPath,
      (track) => {
        track.metadata = {
          ...(track.metadata || {}),
          title: data.title || track.metadata?.title,
          artist: data.artist || track.metadata?.artist,
          album: data.album || track.metadata?.album,
          year: data.year || track.metadata?.year,
          genre: data.genre || track.metadata?.genre,
          track: data.track || track.metadata?.track
        };
      },
      true
    );
    if (data.coverData) {
      try {
        // wyślij jako Uint8Array (wydajniejsze niż number[] dla structuredClone)
        const buf = new Uint8Array(data.coverData);
        window.api?.writeCover(targetPath, Array.from(buf));
      } catch (e) {
        logger.warn('Library', 'writeCover failed', e);
      }
      try {
        player.invalidateCoverCache(targetPath);
      } catch (e) {
        logger.warn('Library', 'invalidateCoverCache failed', e);
      }
    }
    // updateTrack już zrobił refreshDerived, ale dla pewności
    try {
      persistScanned(library);
    } catch (e) {
      logger.warn('Library', 'persistScanned after tag edit failed', e);
    }
    showingMBLookup.value = false;
    editingTrack.value = null;
  }

  return { editingTrack, showingMBLookup, onTagSaved, onMBApply };
}
