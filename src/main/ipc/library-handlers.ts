import { ipcMain } from 'electron';
import { stat } from 'fs/promises';
import { isAbsolute } from 'path';
import type { MediaFile, Playlist } from '../../renderer/src/types/media';
import { getStore } from './cover-cache';
import { logger } from '../../shared/logger';
import { setAllowedRoots } from '../media-server';
import { scanDir } from './library-scan';
import { broadcastToAllWindows } from '../utils/broadcast';
import { startLibraryWatcher, setLibraryWatcherScan } from './library-watcher';

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

async function runLibraryScan(
  folderPaths: string[],
  signal: AbortSignal,
  onProgress?: (current: number, total: number) => void,
  broadcast = false
): Promise<{
  count: number;
  folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
}> {
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
  const store = await getStore();
  const prevData = store.get('libraryScanned', null) as { files?: MediaFile[] } | null | undefined;
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
      const result = await scanDir(folderPath, 8, 0, signal, previous);
      const mediaTotal = result.audioCount + result.videoCount;
      const folderType: 'audio' | 'video' | 'image' | 'mixed' =
        result.imageCount > 0 && result.audioCount === 0 && result.videoCount === 0
          ? 'image'
          : result.audioCount > 0 && result.videoCount === 0
            ? 'audio'
            : result.videoCount > 0 && result.audioCount === 0
              ? 'video'
              : mediaTotal > 0 && result.audioCount / mediaTotal >= 0.7
                ? 'audio'
                : mediaTotal > 0 && result.videoCount / mediaTotal >= 0.7
                  ? 'video'
                  : 'mixed';
      folderResults.push({ folderType, files: result.files, folderPath });
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

  // Hard cap so a renderer cannot flood the store with an unbounded scan.
  if (allFiles.length > MAX_SCANNED_FILES) allFiles.length = MAX_SCANNED_FILES;

  store.set('libraryScanned', structuredClone({ files: allFiles, folderTypes }));

  if (broadcast) broadcastToAllWindows('library:updated');

  logger.info('library', `scan completed: ${allFiles.length} files`);
  return { count: allFiles.length, folderTypes };
}

export function registerLibraryHandlers(): void {
  ipcMain.handle('library:scanCancel', (): boolean => {
    activeScanController?.abort();
    return true;
  });

  ipcMain.handle(
    'library:scan',
    async (
      event,
      folderPaths: string[]
    ): Promise<{
      count: number;
      folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
    }> => {
      const controller = new AbortController();
      activeScanController = controller;
      try {
        currentLibraryFolders = sanitizeFolderPaths(folderPaths);
        return await runLibraryScan(currentLibraryFolders, controller.signal, (current, total) => {
          event.sender.send('library:scan:progress', { current, total });
        });
      } catch (err) {
        logger.error('library', 'scan handler failed', err);
        return { count: 0, folderTypes: {} };
      } finally {
        if (activeScanController === controller) activeScanController = null;
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
    'library:loadScanned',
    async (): Promise<{
      files: MediaFile[];
      folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
    } | null> => {
      try {
        const store = await getStore();
        const data = store.get('libraryScanned', null) as {
          files: MediaFile[];
          folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
        } | null;
        if (
          data &&
          typeof data === 'object' &&
          Array.isArray((data as { files?: unknown }).files)
        ) {
          return data;
        }
        return null;
      } catch (err) {
        logger.error('library', 'loadScanned failed', err);
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
        const store = await getStore();
        store.set('libraryScanned', data);
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
        const store = await getStore();
        const data = store.get('libraryScanned', null) as {
          files: MediaFile[];
          folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
        } | null;
        if (!data || !Array.isArray(data.files)) return;
        const byPath = new Map(clean.map((s) => [s.path, s]));
        let changed = false;
        for (const file of data.files) {
          const s = byPath.get(file.path);
          if (s) {
            file.playCount = s.playCount;
            if (typeof s.lastPlayed === 'number') {
              file.lastPlayed = s.lastPlayed;
            }
            changed = true;
          }
        }
        if (changed) store.set('libraryScanned', data);
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

  // File watcher: re-scan (incremental) when media files change on disk, then
  // broadcast so the renderer refreshes.
  setLibraryWatcherScan(async () => {
    if (activeScanController) activeScanController.abort();
    if (currentLibraryFolders.length === 0) return;
    try {
      await runLibraryScan(currentLibraryFolders, new AbortController().signal, undefined, true);
    } catch (err) {
      logger.error('library', 'watcher re-scan failed', err);
    }
  });
}
