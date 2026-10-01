import type { Ref } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';
import { errMsg } from '@shared/helpers';
import { useUIStore } from './ui';

interface LibraryLoadCtx {
  tracks: Ref<MediaFile[]>;
  folders: Ref<string[]>;
  folderTypes: Ref<Record<string, 'audio' | 'video' | 'image' | 'mixed'>>;
  playlists: Ref<Playlist[]>;
  isLoaded: Ref<boolean>;
  isLoading: Ref<boolean>;
  isScanning: Ref<boolean>;
  scanProgress: Ref<{ current: number; total: number }>;
}

// Files are pulled in bounded slices: a 50k-file library never crosses IPC as a
// single structured-clone payload, and each slice yields to the event loop.
const TRACK_CHUNK_SIZE = 2000;

async function loadTracksInChunks(ctx: LibraryLoadCtx): Promise<void> {
  const first = await window.api?.invoke('library:loadScannedChunk', 0, TRACK_CHUNK_SIZE);
  if (!first) return;
  ctx.folderTypes.value = first.folderTypes || {};
  if (first.total <= first.files.length) {
    ctx.tracks.value = first.files;
    return;
  }
  const all: MediaFile[] = first.files.slice();
  let offset = all.length;
  while (offset < first.total) {
    const chunk = await window.api?.invoke('library:loadScannedChunk', offset, TRACK_CHUNK_SIZE);
    if (!chunk || chunk.files.length === 0) break;
    all.push(...chunk.files);
    offset += chunk.files.length;
  }
  ctx.tracks.value = all;
}

export function useLibraryLoad(ctx: LibraryLoadCtx) {
  async function loadFromDisk() {
    ctx.isLoading.value = true;
    try {
      const [loadedPlaylists, loadedFolders] = await Promise.all([
        (window.api?.invoke('playlist:loadAll') as Promise<Playlist[] | undefined>).catch(
          () => undefined
        ),
        (window.api?.invoke('library:loadFolders') as Promise<string[] | undefined>).catch(
          () => undefined
        )
      ]);
      if (loadedPlaylists) ctx.playlists.value = loadedPlaylists;
      if (loadedFolders) {
        ctx.folders.value = loadedFolders;
      }
    } catch {
      // individual catches handle errors
    }
    await scheduleLoadTracksAsync();
  }

  let loadTracksScheduled = false;
  let loadTracksResolve: Array<() => void> = [];
  const LOAD_TRACKS_TIMEOUT_MS = 5000;

  function scheduleLoadTracks(): void {
    if (loadTracksScheduled) return;
    loadTracksScheduled = true;
    const doLoad = (): void => {
      ctx.isLoading.value = false;
      void loadTracksInChunks(ctx)
        .catch(() => {
          /* nothing to load */
        })
        .finally(() => {
          ctx.isLoaded.value = true;
          loadTracksScheduled = false;
          const res = loadTracksResolve;
          loadTracksResolve = [];
          res.forEach((r) => r());
        });
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(doLoad, { timeout: 3000 });
    } else {
      setTimeout(doLoad, 100);
    }
  }

  /**
   * Resolves once the queued load finishes, or after a ceiling so a caller can
   * never hang. The timer is cleared when the load resolves first — otherwise
   * every call left a 5 s timer behind, and a caller that awaited it kept a
   * promise alive for five seconds after the library was already loaded.
   */
  function scheduleLoadTracksAsync(): Promise<void> {
    return new Promise((resolve) => {
      if (!loadTracksScheduled) scheduleLoadTracks();
      const timer = setTimeout(done, LOAD_TRACKS_TIMEOUT_MS);
      function done(): void {
        clearTimeout(timer);
        const index = loadTracksResolve.indexOf(settled);
        if (index >= 0) loadTracksResolve.splice(index, 1);
        resolve();
      }
      const settled = (): void => done();
      loadTracksResolve.push(settled);
    });
  }

  async function scanFolders() {
    if (ctx.folders.value.length === 0) return;
    ctx.isScanning.value = true;
    ctx.scanProgress.value = { current: 0, total: ctx.folders.value.length };
    const stopListening = window.api?.on('library:scan:progress', (...args: unknown[]) => {
      const data = args[0] as { current?: number; total?: number } | undefined;
      if (data) {
        ctx.scanProgress.value = {
          current: data.current ?? 0,
          total: data.total ?? ctx.folders.value.length
        };
      }
    });
    try {
      const result = (await window.api?.invoke('library:scan', [...ctx.folders.value])) as {
        count: number;
        folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
        aborted?: boolean;
      };
      if (result) {
        ctx.folderTypes.value = result.folderTypes;
        ctx.scanProgress.value = {
          current: ctx.folders.value.length,
          total: ctx.folders.value.length
        };
        if (result.aborted) {
          // The scan was cancelled (or superseded) — reloading now would bring
          // back stale data, so skip it and tell the user instead.
          try {
            useUIStore().notify('error', 'Skanowanie przerwane', 'Spróbuj ponownie.');
          } catch {
            // store not available
          }
        } else {
          scheduleLoadTracks();
        }
      }
    } catch (err) {
      try {
        useUIStore().notify('error', 'Błąd skanowania biblioteki', errMsg(err));
      } catch {
        // store not available
      }
    } finally {
      stopListening?.();
      ctx.isScanning.value = false;
    }
  }

  async function cancelScan() {
    try {
      await window.api?.cancelLibraryScan();
    } catch {
      /* cancel failed */
    }
  }

  return { loadFromDisk, scheduleLoadTracksAsync, scanFolders, cancelScan };
}
