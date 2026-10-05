import type { Ref } from 'vue';
import type { MediaFile, Playlist } from '@renderer/types/media';
import { errMsg } from '@shared/helpers';
import { i18n } from '@renderer/i18n';
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

// Pliki są pobierane w ograniczonych wycinkach: biblioteka 50k plików nigdy nie przechodzi IPC jako
// pojedynczy payload structured-clone, a każdy wycinek oddaje sterowanie event loopowi.
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
      // pojedyncze catch obsługują błędy
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
          /* nic do załadowania */
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
   * Rozwiązuje się, gdy zakolejkowane ładowanie się skończy, lub po pułapie, więc wywołujący
   * nigdy nie zawiesi się. Timer jest czyszczony, gdy ładowanie rozwiąże się pierwsze — inaczej
   * każde wywołanie zostawiało 5-sekundowy timer, a wywołujący, który na niego czekał, trzymał
   * promise żywą przez pięć sekund po tym, jak biblioteka była już załadowana.
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

  // Blokuje podwójny start skanu (np. dwuklik „Skanuj" albo równoległe wejście z
  // ustawień i widoku): drugie wywołanie w locie było pomijane jako no-op, ale
  // wcześniej i tak startowało drugi `library:scan` i jego `finally` kasował
  // `isScanning` pierwszego skanu, zanim ten się skończył.
  let scanInFlight = false;

  async function scanFolders() {
    if (ctx.folders.value.length === 0) return;
    if (scanInFlight) return;
    scanInFlight = true;
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
          // Skanowanie zostało anulowane (lub zastąpione) — ponowne ładowanie teraz przywróciłoby
          // nieaktualne dane, więc pomiń je i zamiast tego powiadom użytkownika.
          try {
            useUIStore().notify(
              'error',
              i18n.global.t('library.scanAborted'),
              i18n.global.t('library.scanAbortedHint')
            );
          } catch {
            // store niedostępny
          }
        } else {
          scheduleLoadTracks();
        }
      }
    } catch (err) {
      try {
        useUIStore().notify('error', i18n.global.t('library.scanError'), errMsg(err));
      } catch {
        // store niedostępny
      }
    } finally {
      stopListening?.();
      ctx.isScanning.value = false;
      scanInFlight = false;
    }
  }

  async function cancelScan() {
    try {
      await window.api?.cancelLibraryScan();
    } catch {
      /* anulowanie nie powiodło się */
    }
  }

  return { loadFromDisk, scheduleLoadTracksAsync, scanFolders, cancelScan };
}
