import { ipcMain, dialog, BrowserWindow } from 'electron';
import { stat, writeFile } from 'fs/promises';
import { isAbsolute, basename } from 'path';
import type { MediaFile, Playlist } from '../../shared/types/media';
import { getStore } from './cover-cache';
import { logger } from '../../shared/logger';
import { setAllowedRoots } from '../media/media-server';
import {
  scanDir,
  classifyFolderType,
  filterFilesForFolderType,
  createScanBudget
} from './library-scan';
import { broadcastToAllWindows } from '../utils/broadcast';
import { startLibraryWatcher, setLibraryWatcherScan } from './library-watcher';
import { loadLibraryScanned, setLibraryScanned, updateLibraryStats } from './library-store';

const MAX_SCAN_FOLDERS = 100;
const MAX_SCANNED_FILES = 50000;

let activeScanController: AbortController | null = null;
let currentLibraryFolders: string[] = [];

// Folders/paths arriving from the renderer are untrusted — keep only non-empty
// absolute paths, dedupe and cap the count.
function sanitizeFolderPaths(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const p = item.trim();
    if (!p || !isAbsolute(p) || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= MAX_SCAN_FOLDERS) break;
  }
  return out;
}

// Adds a folder to the library (idempotent), updating the media-server roots and
// the file watcher. Used by the auto-add-download-folder feature so a download
// landing outside the library is still browsable/playable.
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

export type LibraryScanResult = {
  count: number;
  folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
  aborted: boolean;
  /** True when the file ceiling stopped the walk, so the library is partial. */
  truncated: boolean;
};

async function runLibraryScan(
  folderPaths: string[],
  signal: AbortSignal,
  onProgress?: (current: number, total: number) => void,
  broadcast = false
): Promise<LibraryScanResult> {
  // The budget is shared across folders, so the ceiling is on the whole scan
  // and the walk stops where the ceiling is reached instead of reading
  // everything and dropping most of it afterwards.
  const budget = createScanBudget(MAX_SCANNED_FILES);
  const folderResults: Array<{
    folderType: 'audio' | 'video' | 'image' | 'mixed';
    files: MediaFile[];
    folderPath: string;
  } | null> = [];

  const safePaths = sanitizeFolderPaths(folderPaths);
  const folderTotal = safePaths.length;
  let doneCount = 0;

  // Load the previous scan so unchanged files can be reused (incremental
  // scan) — this preserves playCount/lastPlayed and avoids re-parsing.
  const prevData = await loadLibraryScanned();
  const previous = new Map<string, MediaFile>();
  if (prevData && Array.isArray(prevData.files)) {
    for (const f of prevData.files) {
      if (f && typeof f.path === 'string') previous.set(f.path, f);
    }
  }

  // Scan folders sequentially to avoid saturating the disk, emitting progress per folder.
  for (const folderPath of safePaths) {
    if (signal.aborted) break;
    doneCount++;
    onProgress?.(doneCount, folderTotal);
    try {
      const s = await stat(folderPath).catch(() => null);
      if (!s || !s.isDirectory()) {
        logger.warn('library', `scan skipped (not a directory): ${folderPath}`);
        folderResults.push(null);
        continue;
      }
      const result = await scanDir(folderPath, 8, 0, signal, previous, budget);
      const folderType = classifyFolderType(result);
      folderResults.push({
        folderType,
        files: filterFilesForFolderType(result.files, folderType),
        folderPath
      });
    } catch (err) {
      logger.warn('library', `scan error for ${folderPath}: ${err}`);
      folderResults.push(null);
    }
  }

  const allFiles: MediaFile[] = [];
  const folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'> = {};
  for (const r of folderResults) {
    if (!r) continue;
    folderTypes[r.folderPath] = r.folderType;
    allFiles.push(...r.files);
  }

  // Only persist if the scan completed (not aborted/cancelled).  Aborting
  // mid-scan would write an incomplete list and effectively wipe the library.
  if (!signal.aborted) {
    setLibraryScanned({ files: allFiles, folderTypes });
    if (broadcast) broadcastToAllWindows('library:updated');
  }

  if (budget.truncated) {
    // Silently dropping the rest would look like data loss, or like the library
    // forgot files. Say so instead — the user can raise the limit or split the
    // folder.
    logger.warn(
      'library',
      `scan hit the ${MAX_SCANNED_FILES} file ceiling — the library is incomplete`
    );
  }

  logger.info('library', `scan completed: ${allFiles.length} files`);
  return {
    count: allFiles.length,
    folderTypes,
    aborted: signal.aborted,
    truncated: budget.truncated
  };
}

export function registerLibraryHandlers(): void {
  ipcMain.handle('library:scanCancel', (): boolean => {
    activeScanController?.abort();
    return true;
  });

  ipcMain.handle(
    'library:scan',
    async (event, folderPaths: string[]): Promise<LibraryScanResult> => {
      // A new scan supersedes the running one. Overwriting the controller
      // without aborting left the previous scan walking the whole library in
      // parallel — two full directory traversals, doubled memory, and the
      // slower one deciding what the library finally contains.
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
      const result = sanitizeFolderPaths(folders);
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
      const clean = sanitizeFolderPaths(folders);
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
        // Writes only the changed entries to library-stats.json. Scheduling a full
        // library write here meant serialising every file on the main thread
        // each time a track finished.
        updateLibraryStats(clean);
      } catch (err) {
        logger.error('library', 'updateStats failed', err);
      }
    }
  );

  function isValidPlaylistArray(v: unknown): v is Playlist[] {
    return (
      Array.isArray(v) &&
      v.every(
        (item) =>
          item && typeof item === 'object' && 'id' in item && 'name' in item && 'tracks' in item
      )
    );
  }

  ipcMain.handle('playlist:loadAll', async (): Promise<Playlist[]> => {
    try {
      const store = await getStore();
      const raw = store.get('playlists', []);
      if (isValidPlaylistArray(raw)) return raw;
      return [];
    } catch (err) {
      logger.error('library', 'loadPlaylists failed', err);
      return [];
    }
  });

  ipcMain.handle('playlist:saveAll', async (_event, playlists: Playlist[]): Promise<void> => {
    try {
      const store = await getStore();
      store.set('playlists', playlists);
    } catch (err) {
      logger.error('library', 'savePlaylists failed', err);
    }
  });

  // Export a library playlist as an M3U file. Throws no secrets across IPC —
  // track entries are plain file paths resolved by the main process.
  ipcMain.handle(
    'playlist:export',
    async (
      event,
      input: { id: string; name: string; tracks: string[] }
    ): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false, error: 'No window' };
        if (!input || typeof input.name !== 'string' || !Array.isArray(input.tracks)) {
          return { success: false, error: 'Invalid playlist payload' };
        }
        const sanitizedTracks = input.tracks
          .filter((t): t is string => typeof t === 'string' && t.length > 0)
          .slice(0, 10000);
        const safeName =
          (input.name || 'playlist').replace(/[<>:"/\\|?*]/g, '_').trim() || 'playlist';
        const result = await dialog.showSaveDialog(win, {
          title: 'Export playlist',
          defaultPath: `${safeName}.m3u`,
          filters: [
            { name: 'M3U Playlist', extensions: ['m3u'] },
            { name: 'M3U8 Playlist', extensions: ['m3u8'] }
          ]
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        const header = ['#EXTM3U'];
        for (const p of sanitizedTracks) {
          header.push(`#EXTINF:-1,${basename(p)}`);
          header.push(p);
        }
        await writeFile(result.filePath, header.join('\r\n') + '\r\n', 'utf-8');
        return { success: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('library', 'playlist:export failed', e);
        return { success: false, error: msg };
      }
    }
  );

  // File watcher: re-scan (incremental) when media files change on disk, then
  // broadcast so the renderer refreshes. The watcher must NOT abort a running
  // user-initiated scan — otherwise a refresh clicked during a download would
  // be silently cancelled and the renderer would reload stale data (deleted or
  // new files never showing up). Instead, the watcher defers until the active
  // scan finishes.
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
