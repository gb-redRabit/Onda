import { handleIpc } from '../typed-handle';
import { stat } from 'fs/promises';
import { getStore } from '../cover/cover-cache';
import { logger } from '../../../shared/logger';
import { addAllowedRoot, setAllowedRoots } from '../../media/media-server';
import { isProtectedPath, isSensitivePath } from '../../path-policy';
import { scanFilePaths } from './library-scan';
import { broadcastToAllWindows } from '../../utils/broadcast';
import { startLibraryWatcher, setLibraryWatcherScan } from './library-watcher';
import { flushLibraryScanned, loadLibraryScanned, setLibraryScanned } from './library-store';
import { mergeAddedFiles } from './library-add';
import {
  isSystemTemp,
  sanitizeFilePaths,
  sanitizeFolderPaths,
  withoutSensitivePaths
} from './library-handlers-paths';
import { runLibraryScan, type LibraryScanResult } from './library-handlers-scan';
import { registerPlaylistHandlers } from './library-handlers-playlists';
import { registerLibraryLoudnessHandlers } from './library-handlers-loudness';
import { registerLibraryScannedHandlers } from './library-handlers-scanned';

export { cancelLibraryLoudness } from './library-handlers-loudness';

// Rejestracja kanałów biblioteki (skan, foldery, pliki, postęp, watcher).
// Normalizacja ścieżek jest w `library-handlers-paths.ts`, skan w
// `library-handlers-scan.ts`, playlisty w `library-handlers-playlists.ts`.

let activeScanController: AbortController | null = null;
let currentLibraryFolders: string[] = [];

// Store bywa niedostępny w czystych testach node; brak ustawień oznacza domyślne
// zachowanie (`fastScan: false`), a nie wyjątek przerywający skan.
async function libraryFastScanEnabled(): Promise<boolean> {
  try {
    const store = await getStore();
    return (store.get('library') as { fastScan?: boolean } | undefined)?.fastScan === true;
  } catch (err) {
    logger.warn('library', `fast scan setting unavailable: ${err}`);
    return false;
  }
}

// Dodaje folder do biblioteki (idempotentnie), aktualizując rooty serwera mediów i
// watcher plików. Używane przez funkcję automatycznego dodawania folderu pobierania,
// aby pobranie trafiające poza bibliotekę było nadal przeglądalne/odtwarzalne.
export async function addLibraryFolder(folder: string): Promise<string[]> {
  const store = await getStore();
  const current = withoutSensitivePaths(sanitizeFolderPaths(store.get('libraryFolders', [])));
  if (!current.includes(folder)) current.push(folder);
  const clean = withoutSensitivePaths(sanitizeFolderPaths(current));
  store.set('libraryFolders', clean);
  currentLibraryFolders = clean;
  await setAllowedRoots(clean);
  void startLibraryWatcher(clean);
  return clean;
}

export function registerLibraryHandlers(): void {
  handleIpc('library:scanCancel', (): boolean => {
    activeScanController?.abort();
    return true;
  });

  registerLibraryLoudnessHandlers();

  // Dodaje konkretne pliki (przeciągnięte z systemu) bez skanowania całych folderów.
  // Duplikaty są pomijane, więc upuszczenie tego samego pliku nie tworzy drugiej pozycji.
  handleIpc('library:addFiles', async (_event, input: unknown) => {
    const total = Array.isArray(input) ? input.length : 0;
    const paths = sanitizeFilePaths(input);
    if (paths.length === 0) return { added: 0, skipped: total, total };

    try {
      const data = (await loadLibraryScanned()) ?? { files: [], folderTypes: {} };
      const existing = new Map(data.files.map((file) => [file.path, file]));

      const usable: string[] = [];
      for (const filePath of paths) {
        try {
          const s = await stat(filePath);
          if (!s.isFile()) continue;
          if (isProtectedPath(filePath)) continue;
          if (!isSystemTemp(filePath) && isSensitivePath(filePath)) continue;
          usable.push(filePath);
        } catch {
          // plik zniknął między upuszczeniem a odczytem
        }
      }

      const fastScan = await libraryFastScanEnabled();
      const scanned = await scanFilePaths(usable, existing, fastScan);
      if (scanned.length === 0) return { added: 0, skipped: total, total };

      const merged = mergeAddedFiles(data, scanned);
      if (merged.added === 0) return { added: 0, skipped: total, total };

      // Serwer mediów musi móc odczytać pliki spoza zapisanych folderów biblioteki.
      await Promise.all(merged.dirs.map((dir) => addAllowedRoot(dir)));
      setLibraryScanned({ files: merged.files, folderTypes: merged.folderTypes });
      await flushLibraryScanned();
      broadcastToAllWindows('library:updated', {
        added: merged.addedFiles,
        folderTypes: merged.folderTypes
      });
      return { added: merged.added, skipped: total - merged.added, total };
    } catch (err) {
      logger.error('library', 'addFiles failed', err);
      return {
        added: 0,
        skipped: total,
        total,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  });

  handleIpc('library:scan', async (event, folderPaths: string[]): Promise<LibraryScanResult> => {
    // Nowe skanowanie zastępuje uruchomione. Nadpisanie kontrolera
    // bez przerwania zostawiało poprzednie skanowanie przechodzące całą bibliotekę
    // równolegle — dwa pełne przejścia po katalogach, podwójna pamięć, a
    // wolniejsze decydowało, co finalnie zawiera biblioteka.
    const controller = new AbortController();
    const previous = activeScanController;
    activeScanController = controller;
    previous?.abort();
    try {
      currentLibraryFolders = withoutSensitivePaths(sanitizeFolderPaths(folderPaths));
      const fastScan = await libraryFastScanEnabled();
      return await runLibraryScan(
        currentLibraryFolders,
        controller.signal,
        (current, total) => {
          if (event.sender.isDestroyed?.() !== true) {
            event.sender.send('library:scan:progress', { current, total });
          }
        },
        false,
        fastScan
      );
    } catch (err) {
      logger.error('library', 'scan handler failed', err);
      return { count: 0, folderTypes: {}, aborted: false, truncated: false };
    } finally {
      releaseScanController(controller);
    }
  });

  handleIpc('library:loadFolders', async (): Promise<string[]> => {
    try {
      const store = await getStore();
      const folders = store.get('libraryFolders', []);
      const result = withoutSensitivePaths(sanitizeFolderPaths(folders));
      currentLibraryFolders = result;
      await setAllowedRoots(result);
      void startLibraryWatcher(result);
      return result;
    } catch (err) {
      logger.error('library', 'loadFolders failed', err);
      return [];
    }
  });

  handleIpc('library:saveFolders', async (_event, folders: string[]): Promise<string[]> => {
    try {
      const clean = withoutSensitivePaths(sanitizeFolderPaths(folders));
      const store = await getStore();
      store.set('libraryFolders', clean);
      currentLibraryFolders = clean;
      await setAllowedRoots(clean);
      void startLibraryWatcher(clean);
      return clean;
    } catch (err) {
      logger.error('library', 'saveFolders failed', err);
      throw err;
    }
  });

  registerLibraryScannedHandlers();

  registerPlaylistHandlers();

  // Watcher plików: ponownie skanuje (przyrostowo), gdy pliki mediów zmienią się na dysku,
  // potem rozgłasza, aby renderer się odświeżył. Watcher NIE może przerywać uruchomionego
  // skanowania zainicjowanego przez użytkownika — inaczej odświeżenie kliknięte w trakcie pobierania
  // zostałoby po cichu anulowane, a renderer wczytałby nieaktualne dane (usunięte lub
  // nowe pliki nigdy by się nie pokazały). Zamiast tego watcher czeka, aż aktywne
  // skanowanie się zakończy.
  let watcherRescanRequested = false;

  function releaseScanController(controller: AbortController): void {
    if (activeScanController !== controller) return;
    activeScanController = null;
    if (watcherRescanRequested && currentLibraryFolders.length > 0) {
      watcherRescanRequested = false;
      void runWatcherRescan();
    }
  }

  async function runWatcherRescan(): Promise<void> {
    if (currentLibraryFolders.length === 0) return;
    const controller = new AbortController();
    activeScanController = controller;
    try {
      const fastScan = await libraryFastScanEnabled();
      await runLibraryScan(currentLibraryFolders, controller.signal, undefined, true, fastScan);
    } catch (err) {
      logger.error('library', 'watcher re-scan failed', err);
    } finally {
      releaseScanController(controller);
    }
  }

  setLibraryWatcherScan(() => {
    if (activeScanController) {
      watcherRescanRequested = true;
      return Promise.resolve();
    }
    return runWatcherRescan();
  });
}
