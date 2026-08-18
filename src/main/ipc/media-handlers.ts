import { ipcMain } from 'electron';
import { readFile, rename, unlink, stat } from 'fs/promises';
import { join, extname, dirname } from 'path';
import NodeID3 from 'node-id3';
import { parseFile } from 'music-metadata';
import {
  coverResultCache,
  getStore,
  durationCache,
  cacheSet,
  COVER_CACHE_MAP_KEY,
  PERSISTENT_COVER_DIR
} from './cover-cache';
import { errMsg } from '../../shared/helpers';
import { logger } from '../../shared/logger';
import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';
import { getThumbnail, batchThumbnails } from './media-thumbnails';
import {
  transcodeAudioChunk,
  transcodeAudio,
  transcodeVideo,
  cleanupOldTranscodes
} from './media-transcode';
import { isSafeAbsolutePath, isSafeStringArray } from '../utils/validate';
import { addAllowedRoot } from '../media-server';

export async function getDuration(filePath: string): Promise<number> {
  const cached = durationCache.get(filePath);
  if (cached) {
    try {
      const { mtimeMs } = await stat(filePath);
      if (mtimeMs <= cached.mtimeMs) return cached.duration;
    } catch {
      // file gone — fall through and re-probe
    }
    durationCache.delete(filePath);
  }

  try {
    const meta = await parseFile(filePath, { duration: true });
    const duration = meta.format?.duration || 0;
    const s = await stat(filePath).catch(() => null);
    if (s) cacheSet(durationCache, filePath, { duration, mtimeMs: s.mtimeMs });
    return duration;
  } catch (e) {
    logger.warn('media', `music-metadata failed for ${filePath}`, e);
    try {
      const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
      const stdout = await runCommand(
        ffprobe,
        ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', '--', filePath],
        { timeout: 10000 }
      );
      const duration = parseFloat(stdout.trim()) || 0;
      const s = await stat(filePath).catch(() => null);
      if (s) cacheSet(durationCache, filePath, { duration, mtimeMs: s.mtimeMs });
      return duration;
    } catch (e2) {
      logger.warn('media', `ffprobe duration failed for ${filePath}`, e2);
      return 0;
    }
  }
}

// Shared cover writer used both by the `media:writeCover` IPC handler and by
// the download pipeline (custom cover files / extracted frames). Embeds the
// image into ID3 tags and invalidates the cover cache for the file.
export async function writeCoverToAudioFile(
  filePath: string,
  imageSource: number[] | string
): Promise<{ success: boolean; error?: string }> {
  try {
    let imageBuffer: Buffer;
    let mime = 'image/jpeg';
    if (typeof imageSource === 'string') {
      imageBuffer = await readFile(imageSource);
      const ext = extname(imageSource).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
      };
      mime = mimeMap[ext] || 'image/jpeg';
    } else {
      imageBuffer = Buffer.from(imageSource);
    }
    NodeID3.update(
      {
        image: { mime, type: { id: 3 }, imageBuffer, description: 'Cover' }
      },
      filePath
    );
    coverResultCache.delete(filePath);
    const store = await getStore();
    const cacheMap = store.get(COVER_CACHE_MAP_KEY) as
      Record<string, { cacheFile: string; mtime: number }> | undefined;
    if (cacheMap?.[filePath]) {
      const old = cacheMap[filePath];
      const cachePath = join(PERSISTENT_COVER_DIR, old.cacheFile);
      try {
        await unlink(cachePath);
      } catch {
        // cached cover gone — ok to skip
      }
      delete cacheMap[filePath];
      store.set(COVER_CACHE_MAP_KEY, structuredClone(cacheMap));
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: errMsg(e) };
  }
}

export function registerMediaHandlers(): void {
  ipcMain.handle(
    'media:getThumbnail',
    async (_event, filePath: string, maxSize: number = 320): Promise<string | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      return getThumbnail(filePath, maxSize);
    }
  );

  ipcMain.handle(
    'media:batchThumbnails',
    async (_event, files: string[], maxSize: number = 320): Promise<Record<string, string>> => {
      if (!isSafeStringArray(files)) return {};
      return batchThumbnails(files, maxSize);
    }
  );

  ipcMain.handle(
    'media:writeTags',
    async (
      _event,
      filePath: string,
      tags: Record<string, string | undefined>
    ): Promise<{ success: boolean; error?: string }> => {
      if (!isSafeAbsolutePath(filePath)) return { success: false, error: 'Invalid path' };
      try {
        const toWrite: Record<string, string> = {};
        for (const [key, val] of Object.entries(tags)) {
          if (val !== undefined) toWrite[key] = val;
        }
        NodeID3.update(toWrite, filePath);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: errMsg(e) };
      }
    }
  );

  ipcMain.handle(
    'media:renameFile',
    async (
      _event,
      oldPath: string,
      newName: string
    ): Promise<{ success: boolean; error?: string; newPath?: string }> => {
      if (!isSafeAbsolutePath(oldPath)) return { success: false, error: 'Invalid path' };
      try {
        const safeName = newName.trim().replace(/[<>:"/\\|?*]/g, '_');
        if (!safeName) {
          return { success: false, error: 'Nazwa nie może być pusta' };
        }
        const dir = dirname(oldPath);
        const ext = extname(oldPath);
        const newPath = join(dir, safeName.toLowerCase().endsWith(ext.toLowerCase()) ? safeName : safeName + ext);
        await rename(oldPath, newPath);
        return { success: true, newPath };
      } catch (e: unknown) {
        return { success: false, error: errMsg(e) };
      }
    }
  );

  ipcMain.handle(
    'media:writeCover',
    async (
      _event,
      filePath: string,
      imageSource: number[] | string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!isSafeAbsolutePath(filePath)) return { success: false, error: 'Invalid path' };
      if (typeof imageSource === 'string' && !isSafeAbsolutePath(imageSource)) {
        return { success: false, error: 'Invalid image path' };
      }
      return writeCoverToAudioFile(filePath, imageSource);
    }
  );

  ipcMain.handle(
    'media:readCover',
    async (_event, filePath: string): Promise<{ mime?: string; data?: number[] } | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      try {
        const tags = NodeID3.read(filePath);
        if (tags?.image) {
          const img =
            typeof tags.image === 'string'
              ? { imageBuffer: await readFile(tags.image).catch(() => null), mime: 'image/jpeg' }
              : tags.image;
          if (img?.imageBuffer && Buffer.isBuffer(img.imageBuffer)) {
            return { mime: img.mime || 'image/jpeg', data: Array.from(img.imageBuffer) };
          }
        }
        return null;
      } catch (e) {
        logger.warn('media', `readCover failed for ${filePath}`, e);
        return null;
      }
    }
  );

  ipcMain.handle(
    'media:checkAudioCodec',
    async (_event, filePath: string): Promise<{ codec: string; supported: boolean } | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      try {
        const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
        const stdout = await runCommand(
          ffprobe,
          [
            '-v',
            'quiet',
            '-select_streams',
            'a:0',
            '-show_entries',
            'stream=codec_name',
            '-of',
            'csv=p=0',
            '--',
            filePath
          ],
          { timeout: 15000 }
        );
        const codec = stdout.trim().toLowerCase();
        const supported = [
          'aac',
          'mp3',
          'mp2',
          'opus',
          'vorbis',
          'flac',
          'pcm_s16le',
          'pcm_s16be',
          'pcm_s24le',
          'pcm_f32le'
        ].includes(codec);
        // Uwaga: alac/truehd są celowo POZA listą — Chromium ich nie dekoduje,
        // więc muszą iść przez transkodowanie (inaczej wideo bez dźwięku).
        return { codec, supported };
      } catch (e) {
        logger.warn('media', `checkAudioCodec failed for ${filePath}`, e);
        return null;
      }
    }
  );

  ipcMain.handle(
    'media:transcodeAudioChunk',
    async (
      _event,
      filePath: string,
      startTime: number,
      duration: number
    ): Promise<string | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      return transcodeAudioChunk(filePath, startTime, duration);
    }
  );

  ipcMain.handle(
    'media:transcodeAudio',
    async (_event, filePath: string): Promise<string | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      return transcodeAudio(filePath);
    }
  );

  ipcMain.handle(
    'media:transcodeVideo',
    async (_event, filePath: string): Promise<string | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      return transcodeVideo(filePath);
    }
  );

  // cleanup old transcoded files on startup
  cleanupOldTranscodes();

  // Grants the media server access to a file's folder (or the folder itself),
  // called by the renderer when the user explicitly opens a media file.
  ipcMain.handle('media:grantAccess', async (_event, filePath: unknown): Promise<boolean> => {
    if (!isSafeAbsolutePath(filePath)) return false;
    await addAllowedRoot(filePath);
    await addAllowedRoot(dirname(filePath));
    return true;
  });

  ipcMain.handle('media:getDuration', async (_event, filePath: string): Promise<number> => {
    if (!isSafeAbsolutePath(filePath)) return 0;
    try {
      return await getDuration(filePath);
    } catch (err) {
      logger.warn('media', `media:getDuration failed for ${filePath}: ${err}`);
      return 0;
    }
  });
}
