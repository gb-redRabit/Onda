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
    // używaj JSON jako fallback dla proxy / Uint8Array które structuredClone czasem odrzuca w rendererze
    let files: unknown = null;
    let folderTypes: unknown = null;
    try {
      files = structuredClone(library.tracks as unknown as object);
      folderTypes = structuredClone(library.folderTypes as unknown as object);
    } catch {
      files = JSON.parse(JSON.stringify(library.tracks));
      folderTypes = JSON.parse(JSON.stringify(library.folderTypes));
    }
    (window.api as unknown as { invoke: (ch: string, data: unknown) => Promise<unknown> })
      ?.invoke('library:saveScanned', { files, folderTypes } as unknown as object)
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
        // @ts-ignore — preload akceptuje number[]|string, Uint8Array też przejdzie jako cloneable
        window.api?.writeCover(targetPath, Array.from(buf) as unknown as number[]);
      } catch (e) {
        logger.warn('Library', 'writeCover failed', e);
      }
      try {
        player.invalidateCoverCache(targetPath);
      } catch {}
    }
    // updateTrack już zrobił refreshDerived, ale dla pewności
    try {
      persistScanned(library);
    } catch {}
    showingMBLookup.value = false;
    editingTrack.value = null;
  }

  return { editingTrack, showingMBLookup, onTagSaved, onMBApply };
}
