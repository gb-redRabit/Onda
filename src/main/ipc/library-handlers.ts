import { ipcMain } from 'electron';
import { readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { parseFile } from 'music-metadata';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import type { MediaFile, Playlist } from '../../renderer/src/types/media';
import { VIDEO_EXTS, AUDIO_EXTS, IMAGE_EXTS } from '../../shared/constants';
import { getStore, durationCache, cacheSet, savePersistentCover } from './cover-cache';
import { logger } from '../../shared/logger';

const execAsync = promisify(execCb);
const AUDIO_EXT_SET = new Set(AUDIO_EXTS);
const VIDEO_EXT_SET = new Set(VIDEO_EXTS);
const IMAGE_EXT_SET = new Set(IMAGE_EXTS);

const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff'
};

async function getDuration(filePath: string): Promise<number> {
  const cached = durationCache.get(filePath);
  if (cached) {
    try {
      const { mtimeMs } = await stat(filePath);
      if (mtimeMs <= cached.mtimeMs) return cached.duration;
    } catch {
      /* file gone */
    }
    durationCache.delete(filePath);
  }

  try {
    const meta = await parseFile(filePath, { duration: true });
    const duration = meta.format?.duration || 0;
    const s = await stat(filePath).catch(() => null);
    if (s) cacheSet(durationCache, filePath, { duration, mtimeMs: s.mtimeMs });
    return duration;
  } catch {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
        { encoding: 'utf-8', timeout: 10000, windowsHide: true }
      );
      const duration = parseFloat(stdout.trim()) || 0;
      const s = await stat(filePath).catch(() => null);
      if (s) cacheSet(durationCache, filePath, { duration, mtimeMs: s.mtimeMs });
      return duration;
    } catch {
      return 0;
    }
  }
}

async function getAudioMetadata(
  filePath: string,
  ext: string
): Promise<{
  title: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  track?: { no: number; of?: number };
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  format: string;
  isVideo: boolean;
  size: number;
} | null> {
  try {
    const s = await stat(filePath).catch(() => null);
    if (!s) return null;

    const meta = await parseFile(filePath, { duration: true });
    const c = meta.common;

    let genreStr = '';
    if (c.genre && c.genre.length > 0) genreStr = c.genre[0];

    if (c.picture && c.picture.length > 0) {
      const pic = c.picture[0];
      const imgExt = pic.format === 'image/jpeg' ? 'jpg' : pic.format.replace('image/', '');
      const buf = Buffer.from(pic.data);
      savePersistentCover(filePath, buf, imgExt);
    }

    return {
      title: c.title || basename(filePath, ext),
      artist: c.artist || '',
      album: c.album || '',
      year: c.year || undefined,
      genre: genreStr,
      track: c.track?.no ? { no: c.track.no, of: c.track.of ?? undefined } : undefined,
      duration: meta.format?.duration || 0,
      bitrate: meta.format?.bitrate || 0,
      sampleRate: meta.format?.sampleRate || 0,
      channels: 0,
      format: ext.slice(1),
      isVideo: false,
      size: s.size
    };
  } catch {
    return null;
  }
}

async function getMetadata(
  filePath: string,
  ext: string
): Promise<{
  title: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  track?: { no: number; of?: number };
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  format: string;
  isVideo: boolean;
  size: number;
} | null> {
  try {
    const s = await stat(filePath).catch(() => null);
    if (!s) return null;

    const isVideo = VIDEO_EXTS.includes(ext);

    if (!isVideo) {
      return getAudioMetadata(filePath, ext);
    }

    return {
      title: basename(filePath, ext),
      artist: '',
      album: '',
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      format: ext.slice(1),
      isVideo: true,
      size: s.size
    };
  } catch {
    return null;
  }
}

async function processAudioFile(
  fullPath: string,
  entryName: string,
  ext: string
): Promise<{ file: MediaFile | null }> {
  const s = await stat(fullPath).catch(() => null);
  if (!s) return { file: null };
  const meta = await getMetadata(fullPath, ext);
  return {
    file: {
      id: fullPath,
      name: entryName,
      path: fullPath,
      extension: ext,
      mimeType: '',
      size: s.size,
      type: 'audio',
      metadata: meta
        ? {
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            year: meta.year,
            genre: meta.genre,
            track: meta.track
          }
        : undefined,
      duration: meta?.duration || 0,
      addedAt: s.birthtimeMs ?? Date.now(),
      playCount: 0
    }
  };
}

async function processVideoFile(
  fullPath: string,
  entryName: string,
  ext: string
): Promise<{ file: MediaFile | null }> {
  const s = await stat(fullPath).catch(() => null);
  if (!s) return { file: null };
  const duration = await getDuration(fullPath);
  return {
    file: {
      id: fullPath,
      name: entryName,
      path: fullPath,
      extension: ext,
      mimeType: '',
      size: s.size,
      type: 'video',
      duration,
      addedAt: s.birthtimeMs ?? Date.now(),
      playCount: 0
    }
  };
}

async function processImageFile(
  fullPath: string,
  entryName: string,
  ext: string
): Promise<{ file: MediaFile | null }> {
  const s = await stat(fullPath).catch(() => null);
  if (!s) return { file: null };
  return {
    file: {
      id: fullPath,
      name: entryName,
      path: fullPath,
      extension: ext,
      mimeType: IMAGE_MIME[ext] || '',
      size: s.size,
      type: 'image',
      addedAt: s.birthtimeMs ?? Date.now(),
      playCount: 0
    }
  };
}

async function scanDir(
  dirPath: string,
  maxDepth = 10,
  depth = 0
): Promise<{ files: MediaFile[]; audioCount: number; videoCount: number; imageCount: number }> {
  if (depth > maxDepth) return { files: [], audioCount: 0, videoCount: 0, imageCount: 0 };

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const subDirPromises: Promise<{
      files: MediaFile[];
      audioCount: number;
      videoCount: number;
      imageCount: number;
    }>[] = [];
    const audioTasks: Array<() => Promise<{ file: MediaFile | null }>> = [];
    const videoTasks: Array<() => Promise<{ file: MediaFile | null }>> = [];
    const imageTasks: Array<() => Promise<{ file: MediaFile | null }>> = [];
    let audioCount = 0;
    let videoCount = 0;
    let imageCount = 0;

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        subDirPromises.push(scanDir(fullPath, maxDepth, depth + 1));
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (AUDIO_EXT_SET.has(ext)) {
          audioCount++;
          audioTasks.push(() => processAudioFile(fullPath, entry.name, ext));
        } else if (VIDEO_EXT_SET.has(ext)) {
          videoCount++;
          videoTasks.push(() => processVideoFile(fullPath, entry.name, ext));
        } else if (IMAGE_EXT_SET.has(ext)) {
          imageCount++;
          imageTasks.push(() => processImageFile(fullPath, entry.name, ext));
        }
      }
    }

    const chunkSize = 50;
    const fileResults: Array<{ file: MediaFile | null }> = [];
    let ai = 0;
    let vi = 0;
    let ii = 0;
    while (ai < audioTasks.length || vi < videoTasks.length || ii < imageTasks.length) {
      const chunk: Array<() => Promise<{ file: MediaFile | null }>> = [];
      while (
        chunk.length < chunkSize &&
        (ai < audioTasks.length || vi < videoTasks.length || ii < imageTasks.length)
      ) {
        if (ai < audioTasks.length && (vi >= videoTasks.length || chunk.length % 3 === 0)) {
          chunk.push(audioTasks[ai++]);
        } else if (ii < imageTasks.length && (vi >= videoTasks.length || chunk.length % 3 === 1)) {
          chunk.push(imageTasks[ii++]);
        } else if (vi < videoTasks.length) {
          chunk.push(videoTasks[vi++]);
        } else if (ai < audioTasks.length) {
          chunk.push(audioTasks[ai++]);
        } else if (ii < imageTasks.length) {
          chunk.push(imageTasks[ii++]);
        }
      }
      const results = await Promise.all(chunk.map((fn) => fn()));
      fileResults.push(...results);
    }

    const subResults = await Promise.all(subDirPromises);

    const files: MediaFile[] = [];
    let totalAudio = 0;
    let totalVideo = 0;
    let totalImage = 0;

    for (const r of subResults) {
      files.push(...r.files);
      totalAudio += r.audioCount;
      totalVideo += r.videoCount;
      totalImage += r.imageCount;
    }

    for (const r of fileResults) {
      if (r.file) files.push(r.file);
    }
    totalAudio += audioCount;
    totalVideo += videoCount;
    totalImage += imageCount;

    return { files, audioCount: totalAudio, videoCount: totalVideo, imageCount: totalImage };
  } catch (err) {
    logger.warn('library', `scanDir error reading ${dirPath}: ${err}`);
    return { files: [], audioCount: 0, videoCount: 0, imageCount: 0 };
  }
}

export function registerLibraryHandlers(): void {
  ipcMain.handle(
    'library:scan',
    async (
      _event,
      folderPaths: string[]
    ): Promise<{ count: number; folderTypes: Record<string, 'audio' | 'video' | 'mixed'> }> => {
      try {
        const folderResults = await Promise.all(
          folderPaths.map(async (folderPath) => {
            try {
              const result = await scanDir(folderPath, 8);
              const total = result.audioCount + result.videoCount;
              const folderType: 'audio' | 'video' | 'mixed' =
                result.audioCount > 0 && result.videoCount === 0
                  ? 'audio'
                  : result.videoCount > 0 && result.audioCount === 0
                    ? 'video'
                    : result.audioCount / total >= 0.7
                      ? 'audio'
                      : result.videoCount / total >= 0.7
                        ? 'video'
                        : 'mixed';
              return { folderType, files: result.files, folderPath };
            } catch (err) {
              logger.warn('library', `scan error for ${folderPath}: ${err}`);
              return null;
            }
          })
        );

        const allFiles: MediaFile[] = [];
        const folderTypes: Record<string, 'audio' | 'video' | 'mixed'> = {};
        for (const r of folderResults) {
          if (!r) continue;
          folderTypes[r.folderPath] = r.folderType;
          allFiles.push(...r.files);
        }

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
      return Array.isArray(folders) ? folders : [];
    } catch (err) {
      logger.error('library', 'loadFolders failed', err);
      return [];
    }
  });

  ipcMain.handle('library:saveFolders', async (_event, folders: string[]): Promise<string[]> => {
    try {
      const store = await getStore();
      store.set('libraryFolders', folders);
      return folders;
    } catch (err) {
      logger.error('library', 'saveFolders failed', err);
      throw err;
    }
  });

  ipcMain.handle(
    'library:loadScanned',
    async (): Promise<{
      files: MediaFile[];
      folderTypes: Record<string, 'audio' | 'video' | 'mixed'>;
    } | null> => {
      try {
        const store = await getStore();
        const data = store.get('libraryScanned', null) as {
          files: MediaFile[];
          folderTypes: Record<string, 'audio' | 'video' | 'mixed'>;
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
      data: { files: MediaFile[]; folderTypes: Record<string, 'audio' | 'video' | 'mixed'> }
    ): Promise<void> => {
      try {
        const store = await getStore();
        store.set('libraryScanned', data);
      } catch (err) {
        logger.error('library', 'saveScanned failed', err);
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

  ipcMain.handle('media:getDuration', async (_event, filePath: string): Promise<number> => {
    try {
      return await getDuration(filePath);
    } catch (err) {
      logger.warn('library', `media:getDuration failed for ${filePath}: ${err}`);
      return 0;
    }
  });
}
