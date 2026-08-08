import { ipcMain } from 'electron';
import { stat } from 'fs/promises';
import { isAbsolute } from 'path';
import type { MediaFile, Playlist } from '../../renderer/src/types/media';
import { getStore } from './cover-cache';
import { logger } from '../../shared/logger';
import { setAllowedRoots } from '../media-server';
import { scanDir } from './library-scan';

const MAX_SCAN_FOLDERS = 100;
const MAX_SCANNED_FILES = 50000;

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

export function registerLibraryHandlers(): void {
  ipcMain.handle(
    'library:scan',
    async (
      event,
      folderPaths: string[]
    ): Promise<{
      count: number;
      folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
    }> => {
      try {
        const folderResults: Array<{
          folderType: 'audio' | 'video' | 'image' | 'mixed';
          files: MediaFile[];
          folderPath: string;
        } | null> = [];

        const safePaths = sanitizeFolderPaths(folderPaths);
        const folderTotal = safePaths.length;
        let doneCount = 0;

        // Scan folders sequentially to avoid saturating the disk, emitting progress per folder.
        for (const folderPath of safePaths) {
          doneCount++;
          try {
            event.sender.send('library:scan:progress', {
              current: doneCount,
              total: folderTotal
            });
            const s = await stat(folderPath).catch(() => null);
            if (!s || !s.isDirectory()) {
              logger.warn('library', `scan skipped (not a directory): ${folderPath}`);
              folderResults.push(null);
              continue;
            }
            const result = await scanDir(folderPath, 8);
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

        const store = await getStore();
        store.set('libraryScanned', structuredClone({ files: allFiles, folderTypes }));

        logger.info('library', `scan completed: ${allFiles.length} files`);
        return { count: allFiles.length, folderTypes };
      } catch (err) {
        logger.error('library', 'scan handler failed', err);
        return { count: 0, folderTypes: {} };
      }
    }
  );

  ipcMain.handle('library:loadFolders', async (): Promise<string[]> => {
    try {
      const store = await getStore();
      const folders = store.get('libraryFolders', []);
      const result = sanitizeFolderPaths(folders);
      await setAllowedRoots(result);
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
      await setAllowedRoots(clean);
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
      data: { files: MediaFile[]; folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'> }
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
}
