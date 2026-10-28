import { ipcMain } from 'electron';
import { stat } from 'fs/promises';
import { dirname } from 'path';
import type { MediaFile } from '../../../shared/types/media';
import { getStore } from '../cover/cover-cache';
import { logger } from '../../../shared/logger';
import { addAllowedRoot, setAllowedRoots } from '../../media/media-server';
import { isProtectedPath, isSensitivePath } from '../../path-policy';
import { scanFilePaths } from './library-scan';
import { broadcastToAllWindows } from '../../utils/broadcast';
import { e2eFixturesEnabled } from '../../e2e-fixtures';
import { startLibraryWatcher, setLibraryWatcherScan } from './library-watcher';
import {
  applyLoudnessUpdates,
  flushLibraryScanned,
  loadLibraryScanned,
  setLibraryScanned,
  updateLibraryStats
} from './library-store';
import { analyzeLibraryLoudness } from './loudness-analysis';
import { mergeAddedFiles } from './library-add';
import {
  isSystemTemp,
  sanitizeFilePaths,
  sanitizeFolderPaths,
  withoutSensitivePaths
} from './library-handlers-paths';
import { runLibraryScan, type LibraryScanResult } from './library-handlers-scan';
import { registerPlaylistHandlers } from './library-handlers-playlists';

// Rejestracja kanałów biblioteki (skan, foldery, pliki, postęp, watcher).
// Normalizacja ścieżek jest w `library-handlers-paths.ts`, skan w
// `library-handlers-scan.ts`, playlisty w `library-handlers-playlists.ts`.

let activeScanController: AbortController | null = null;
let activeLoudnessController: AbortController | null = null;
let currentLibraryFolders: string[] = [];

// Dodaje folder do biblioteki (idempotentnie), aktualizując rooty serwera mediów i
// watcher plików. Używane przez funkcję automatycznego dodawania folderu pobierania,
// aby pobranie trafiające poza bibliotekę było nadal przeglądalne/odtwarzalne.
export async function addLibraryFolder(folder: string): Promise<string[]> {
  const store = await getStore();
  const current = sanitizeFolderPaths(store.get('libraryFolders', []));
  if (!current.includes(folder)) current.push(folder);
  const clean = sanitizeFolderPaths(current);
  store.set('libraryFolders', clean);
  currentLibraryFolders = clean;
  await setAllowedRoots(clean);
  void startLibraryWatcher(clean);
  return clean;
}

export function registerLibraryHandlers(): void {
  ipcMain.handle('library:scanCancel', (): boolean => {
    activeScanController?.abort();
    return true;
  });

  ipcMain.handle('library:loudnessCancel', (): boolean => {
    activeLoudnessController?.abort();
    return true;
  });

  // Analiza głośności plików bez tagów ReplayGain. Długotrwała (dekoduje całe pliki),
  // więc raportuje postęp i daje się anulować; nowe uruchomienie zastępuje poprzednie.
  ipcMain.handle('library:analyzeLoudness', async (event) => {
    const controller = new AbortController();
    const previous = activeLoudnessController;
    activeLoudnessController = controller;
    previous?.abort();
    try {
      const data = await loadLibraryScanned();
      if (!data) {
        return {
          analyzed: 0,
          albums: 0,
          failed: 0,
          aborted: false,
          truncated: false,
          updated: 0
        };
      }
      const { updates, summary } = await analyzeLibraryLoudness(
        data.files,
        controller.signal,
        (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('library:loudness:progress', progress);
          }
        }
      );
      const updated = applyLoudnessUpdates(updates);
      if (updated > 0) {
        await flushLibraryScanned();
        broadcastToAllWindows('library:updated');
      }
      return { ...summary, updated };
    } catch (err) {
      logger.error('library', 'loudness analysis failed', err);
      return {
        analyzed: 0,
        albums: 0,
        failed: 0,
        aborted: controller.signal.aborted,
        truncated: false,
        updated: 0,
        error: err instanceof Error ? err.message : String(err)
      };
    } finally {
      if (activeLoudnessController === controller) activeLoudnessController = null;
    }
  });

  // Dodaje konkretne pliki (przeciągnięte z systemu) bez skanowania całych folderów.
  // Duplikaty są pomijane, więc upuszczenie tego samego pliku nie tworzy drugiej pozycji.
  ipcMain.handle('library:addFiles', async (_event, input: unknown) => {
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
          if (isProtectedPath(filePath) || isProtectedPath(dirname(filePath))) continue;
          if (!isSystemTemp(filePath) && isSensitivePath(filePath)) continue;
          usable.push(filePath);
        } catch {
          // plik zniknął między upuszczeniem a odczytem
        }
      }

      const scanned = await scanFilePaths(usable, existing);
      if (scanned.length === 0) return { added: 0, skipped: total, total };

      const merged = mergeAddedFiles(data, scanned);
      if (merged.added === 0) return { added: 0, skipped: total, total };

      // Serwer mediów musi móc odczytać pliki spoza zapisanych folderów biblioteki.
      await Promise.all(merged.dirs.map((dir) => addAllowedRoot(dir)));
      setLibraryScanned({ files: merged.files, folderTypes: merged.folderTypes });
      await flushLibraryScanned();
      broadcastToAllWindows('library:updated');
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

  ipcMain.handle(
    'library:scan',
    async (event, folderPaths: string[]): Promise<LibraryScanResult> => {
      // Nowe skanowanie zastępuje uruchomione. Nadpisanie kontrolera
      // bez przerwania zostawiało poprzednie skanowanie przechodzące całą bibliotekę
      // równolegle — dwa pełne przejścia po katalogach, podwójna pamięć, a
      // wolniejsze decydowało, co finalnie zawiera biblioteka.
      const controller = new AbortController();
      const previous = activeScanController;
      activeScanController = controller;
      previous?.abort();
      try {
        currentLibraryFolders = sanitizeFolderPaths(folderPaths);
        return await runLibraryScan(currentLibraryFolders, controller.signal, (current, total) => {
          event.sender.send('library:scan:progress', { current, total });
        });
      } catch (err) {
        logger.error('library', 'scan handler failed', err);
        return { count: 0, folderTypes: {}, aborted: false, truncated: false };
      } finally {
        releaseScanController(controller);
      }
    }
  );

  ipcMain.handle('library:loadFolders', async (): Promise<string[]> => {
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

  ipcMain.handle('library:saveFolders', async (_event, folders: string[]): Promise<string[]> => {
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

  ipcMain.handle(
    'library:loadScannedChunk',
    async (
      _event,
      offset: unknown,
      limit: unknown
    ): Promise<{
      files: MediaFile[];
      total: number;
      folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
    } | null> => {
      // Test-only: pozwala sprawdzić realny banner błędu biblioteki w E2E
      // bez uszkadzania plików użytkownika. Poza try/catch, żeby IPC odrzuciło.
      if (e2eFixturesEnabled() && process.env.ONDA_E2E_LIBRARY_FAIL === '1') {
        throw new Error('E2E library load failure');
      }
      try {
        const data = await loadLibraryScanned();
        if (!data) return null;
        const start = Math.max(0, Math.floor(Number(offset) || 0));
        const size = Math.min(5000, Math.max(1, Math.floor(Number(limit) || 1000)));
        return {
          files: data.files.slice(start, start + size),
          total: data.files.length,
          folderTypes: data.folderTypes
        };
      } catch (err) {
        logger.error('library', 'loadScannedChunk failed', err);
        return null;
      }
    }
  );

  ipcMain.handle(
    'library:saveScanned',
    async (
      _event,
      data: {
        files: MediaFile[];
        folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
      }
    ): Promise<void> => {
      try {
        setLibraryScanned(data);
      } catch (err) {
        logger.error('library', 'saveScanned failed', err);
      }
    }
  );

  ipcMain.handle(
    'library:updateStats',
    async (
      _event,
      stats: Array<{ path: string; playCount: number; lastPlayed: number }>
    ): Promise<void> => {
      if (!Array.isArray(stats) || stats.length === 0) return;
      const clean = stats.filter(
        (s) => s && typeof s.path === 'string' && s.path && typeof s.playCount === 'number'
      );
      if (clean.length === 0) return;
      try {
        const data = await loadLibraryScanned();
        if (!data || !Array.isArray(data.files)) return;
        // Zapisuje tylko zmienione wpisy do library-stats.json. Zaplanowanie pełnego
        // zapisu biblioteki tutaj oznaczałoby serializację każdego pliku w wątku main
        // przy każdym zakończeniu utworu.
        updateLibraryStats(clean);
      } catch (err) {
        logger.error('library', 'updateStats failed', err);
      }
    }
  );

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
      await runLibraryScan(currentLibraryFolders, controller.signal, undefined, true);
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
