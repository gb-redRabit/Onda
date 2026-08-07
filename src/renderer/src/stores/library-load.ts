import type { Ref } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';
import { errMsg } from '@shared/helpers';
import { useUIStore } from './ui';

export interface LibraryLoadCtx {
  tracks: Ref<MediaFile[]>;
  folders: Ref<string[]>;
  folderTypes: Ref<Record<string, 'audio' | 'video' | 'image' | 'mixed'>>;
  playlists: Ref<Playlist[]>;
  isLoaded: Ref<boolean>;
  isLoading: Ref<boolean>;
  isScanning: Ref<boolean>;
  scanProgress: Ref<{ current: number; total: number }>;
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
  let loadTracksResolve: (() => void)[] = [];

  function scheduleLoadTracks(): void {
    if (loadTracksScheduled) return;
    loadTracksScheduled = true;
    const doLoad = (): void => {
      ctx.isLoading.value = false;
      window.api
        ?.invoke('library:loadScanned')
        .then((result) => {
          if (result?.files) {
            ctx.tracks.value = result.files;
            ctx.folderTypes.value = result.folderTypes || {};
          }
          ctx.isLoaded.value = true;
        })
        .catch(() => {
          ctx.isLoaded.value = true;
        })
        .finally(() => {
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

  function scheduleLoadTracksAsync(): Promise<void> {
    return new Promise((resolve) => {
      if (!loadTracksScheduled) scheduleLoadTracks();
      loadTracksResolve.push(resolve);
      setTimeout(resolve, 5000);
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
      };
      if (result) {
        ctx.folderTypes.value = result.folderTypes;
        ctx.scanProgress.value = {
          current: ctx.folders.value.length,
          total: ctx.folders.value.length
        };
        scheduleLoadTracks();
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

  return { loadFromDisk, scheduleLoadTracksAsync, scanFolders };
}
