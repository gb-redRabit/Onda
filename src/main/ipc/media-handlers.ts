import { ipcMain, nativeImage } from 'electron';
import { readFile, rename, unlink, stat, mkdir, access, writeFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { createHash } from 'crypto';
import NodeID3 from 'node-id3';
import sharp from 'sharp';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { AUDIO_EXTS, VIDEO_EXTS } from '../../shared/constants';
import { coverResultCache, getStore, COVER_CACHE_MAP_KEY, PERSISTENT_COVER_DIR, extractAndCacheCover } from './cover-cache';
import { SharpService } from '../utils/sharp';
import { errMsg } from '../../shared/helpers';
import { logger } from '../utils/logger';

const execAsync = promisify(execCb);

export function registerMediaHandlers(): void {
  ipcMain.handle('media:getThumbnail', async (_event, filePath: string, maxSize: number = 320): Promise<string | null> => {
    try {
      const cacheDir = join(os.tmpdir(), 'onda', 'thumbs');
      const hash = createHash('md5').update(filePath + maxSize).digest('hex');
      const cacheFile = join(cacheDir, `${hash}.jpg`);
      try {
        await access(cacheFile);
        return `data:image/jpeg;base64,${(await readFile(cacheFile)).toString('base64')}`;
      } catch {}

      let buf: Buffer | null = null;

      try {
        const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: maxSize, height: maxSize });
        if (!thumb.isEmpty()) {
          buf = thumb.toJPEG(85);
          await mkdir(cacheDir, { recursive: true }).catch(() => {});
          await writeFile(cacheFile, buf);
        }
      } catch (e) {
        buf = await SharpService.getThumbnail(filePath, maxSize);
      }

      if (!buf) {
        const ext = extname(filePath).toLowerCase();
        if (AUDIO_EXTS.includes(ext) || VIDEO_EXTS.includes(ext)) {
          const cover = await extractAndCacheCover(filePath);
          if (cover.type === 'image' && cover.data) {
            const b64 = cover.data.replace(/^data:image\/\w+;base64,/, '');
            buf = Buffer.from(b64, 'base64');
            if (buf.length > 50000) {
              try {
                buf = await sharp(buf).resize(maxSize, maxSize, { fit: 'outside' }).jpeg({ quality: 85 }).toBuffer();
              } catch { /* use original */ }
            }
          }
        }
      }

      if (!buf) {
        return null;
      }
      await mkdir(cacheDir, { recursive: true }).catch(() => {});
      await writeFile(cacheFile, buf);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch (e) {
      return null;
    }
  });

const batchThumbnailLocks = new Set<string>();

  ipcMain.handle('media:batchThumbnails', async (
    _event,
    files: string[],
    maxSize: number = 320
  ): Promise<Record<string, string>> => {
    const result: Record<string, string> = {};
    const cacheDir = join(os.tmpdir(), 'onda', 'thumbs');
    await mkdir(cacheDir, { recursive: true }).catch(() => {});
    const concurrency = Math.max(1, os.cpus().length - 1);

    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const promises = batch.map(async (filePath) => {
        try {
          const hash = createHash('md5').update(filePath + maxSize).digest('hex');
          const cacheFile = join(cacheDir, `${hash}.jpg`);
          try {
            await access(cacheFile);
            result[filePath] = `data:image/jpeg;base64,${(await readFile(cacheFile)).toString('base64')}`;
            return;
          } catch {}

          while (batchThumbnailLocks.has(cacheFile)) {
            await new Promise<void>((resolve) => {
              const check = setInterval(() => {
                if (!batchThumbnailLocks.has(cacheFile)) { clearInterval(check); resolve(); }
              }, 10);
              setTimeout(() => { clearInterval(check); resolve(); }, 5000);
            });
          }
          batchThumbnailLocks.add(cacheFile);

          try {
            let buf: Buffer | null = null;
            try {
              const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: maxSize, height: maxSize });
              if (!thumb.isEmpty()) {
                buf = thumb.toJPEG(85);
                await writeFile(cacheFile, buf);
              }
            } catch {
              buf = await SharpService.getThumbnail(filePath, maxSize);
            }

            if (buf) {
              await writeFile(cacheFile, buf);
              result[filePath] = `data:image/jpeg;base64,${buf.toString('base64')}`;
            }
          } finally {
            batchThumbnailLocks.delete(cacheFile);
          }
        } catch {
          // skip
        }
      });
      await Promise.all(promises);
    }
    return result;
  });

  ipcMain.handle(
    'media:writeTags',
    async (
      _event,
      filePath: string,
      tags: Record<string, string | undefined>
    ): Promise<{ success: boolean; error?: string }> => {
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
      try {
        const dir = dirname(oldPath);
        const ext = extname(oldPath);
        const safeName = newName.replace(/[<>:"/\\|?*]/g, '_');
        const newPath = join(dir, safeName.endsWith(ext) ? safeName : safeName + ext);
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
        const cacheMap: Record<string, { cacheFile: string; mtime: number }> | undefined = store.get(
          COVER_CACHE_MAP_KEY
        ) as any;
        if (cacheMap?.[filePath]) {
          const old = cacheMap[filePath];
          const cachePath = join(PERSISTENT_COVER_DIR, old.cacheFile);
          try { await unlink(cachePath); } catch { /* ok */ }
          delete cacheMap[filePath];
          store.set(COVER_CACHE_MAP_KEY, structuredClone(cacheMap));
        }
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: errMsg(e) };
      }
    }
  );

  ipcMain.handle(
    'media:readCover',
    async (_event, filePath: string): Promise<{ mime?: string; data?: number[] } | null> => {
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
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    'media:checkAudioCodec',
    async (_event, filePath: string): Promise<{ codec: string; supported: boolean } | null> => {
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
          { timeout: 15000, windowsHide: true }
        );
        const codec = stdout.trim().toLowerCase();
        const supported = [
          'aac', 'mp3', 'mp2', 'opus', 'vorbis', 'flac',
          'pcm_s16le', 'pcm_s16be', 'pcm_s24le', 'pcm_f32le',
          'alac', 'truehd'
        ].includes(codec);
        return { codec, supported };
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    'media:transcodeAudioChunk',
    async (_event, filePath: string, startTime: number, duration: number): Promise<string | null> => {
      const tempDir = join(os.tmpdir(), 'onda', 'audio-transcodes');
      await mkdir(tempDir, { recursive: true });
      const hash = createHash('md5').update(filePath).digest('hex');
      const chunkKey = `${hash}_${Math.floor(startTime)}_${Math.ceil(duration)}`;
      const outPath = join(tempDir, `${chunkKey}.m4a`);

      try {
        await stat(outPath);
        return outPath;
      } catch {}

      try {
        await execAsync(
          `ffmpeg -v error -ss ${startTime} -i "${filePath}" -map 0:a:0 -t ${duration} -c:a aac -b:a 192k "${outPath}" -y`,
          { timeout: 120000, windowsHide: true }
        );
        return outPath;
      } catch (err) {
        logger.error('transcode', 'audio chunk failed', errMsg(err));
        return null;
      }
    }
  );

  ipcMain.handle(
    'media:transcodeAudio',
    async (_event, filePath: string): Promise<string | null> => {
      const tempDir = join(os.tmpdir(), 'onda', 'audio-transcodes');
      await mkdir(tempDir, { recursive: true });
      const hash = createHash('md5').update(filePath).digest('hex');
      const outPath = join(tempDir, `${hash}.m4a`);

      try {
        await stat(outPath);
        return outPath;
      } catch {}

      try {
        await execAsync(
          `ffmpeg -v error -i "${filePath}" -map 0:a:0 -c:a aac -b:a 192k "${outPath}" -y`,
          { timeout: 600000, windowsHide: true }
        );
        return outPath;
      } catch (err) {
        logger.error('transcode', 'audio transcode failed', errMsg(err));
        return null;
      }
    }
  );

  ipcMain.handle(
    'media:cleanupTranscodedAudio',
    async (_event, audioPath: string): Promise<void> => {
      try {
        await unlink(audioPath);
      } catch {}
    }
  );

  // cleanup old transcoded files on startup
  (async () => {
    try {
      const tempDir = join(os.tmpdir(), 'onda', 'audio-transcodes');
      await mkdir(tempDir, { recursive: true });
      const { readdir } = await import('fs/promises');
      const { rm } = await import('fs/promises');
      const entries = await readdir(tempDir);
      const now = Date.now();
      for (const entry of entries) {
        try {
          const fullPath = join(tempDir, entry);
          const s = await stat(fullPath);
          if (now - s.mtimeMs > 24 * 60 * 60 * 1000) {
            await rm(fullPath, { force: true });
          }
        } catch {}
      }
    } catch {}
  })();
}
