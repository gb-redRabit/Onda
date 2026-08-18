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

function persistScanned(library: ReturnType<typeof useLibraryStore>) {
  try {
    const files = structuredClone(library.tracks);
    const folderTypes = structuredClone(library.folderTypes);
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
    editingTrack.value.metadata = {
      ...(editingTrack.value.metadata || {}),
      title: data.title || editingTrack.value.metadata?.title,
      artist: data.artist || editingTrack.value.metadata?.artist,
      album: data.album || editingTrack.value.metadata?.album,
      year: data.year || editingTrack.value.metadata?.year,
      genre: data.genre || editingTrack.value.metadata?.genre,
      track: data.track || editingTrack.value.metadata?.track
    };
    if (data.coverData) {
      window.api?.writeCover(editingTrack.value.path, data.coverData);
      player.invalidateCoverCache(editingTrack.value.path);
    }
    library.refreshDerived();
    persistScanned(library);
    showingMBLookup.value = false;
    editingTrack.value = null;
  }

  return { editingTrack, showingMBLookup, onTagSaved, onMBApply };
}
