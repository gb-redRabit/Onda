import { nativeImage } from 'electron';
import { mkdir, access, readFile, writeFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';
import os from 'os';
import { AUDIO_EXTS, VIDEO_EXTS, MAX_THUMB_SIZE } from '../../shared/constants';
import { extractAndCacheCover } from './cover-cache';
import { SharpService } from '../utils/sharp';
import { logger } from '../../shared/logger';

const cacheDir = join(os.tmpdir(), 'onda', 'thumbs');

export function sanitizeThumbSize(size: number): number {
  const n = Math.floor(Number(size));
  if (!Number.isFinite(n) || n < 16) return 320;
  return Math.min(n, MAX_THUMB_SIZE);
}

async function readCache(cacheFile: string): Promise<string | null> {
  try {
    await access(cacheFile);
    return `data:image/jpeg;base64,${(await readFile(cacheFile)).toString('base64')}`;
  } catch {
    return null;
  }
}

// Include size + mtime so a replaced file never reuses a stale thumbnail.
async function sourceStamp(filePath: string): Promise<string> {
  try {
    const s = await stat(filePath);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return '';
  }
}

async function buildThumbnail(filePath: string, maxSize: number): Promise<Buffer | null> {
  const ext = extname(filePath).toLowerCase();
  const isAudio = AUDIO_EXTS.includes(ext);
  let buf: Buffer | null = null;

  if (!isAudio) {
    try {
      const thumb = await nativeImage.createThumbnailFromPath(filePath, {
        width: maxSize,
        height: maxSize
      });
      if (!thumb.isEmpty()) {
        buf = thumb.toJPEG(85);
      }
    } catch (e) {
      logger.info('media', `native thumbnail failed for ${filePath}`, e);
    }
  }

  if (!buf) {
    buf = await SharpService.getThumbnail(filePath, maxSize);
  }

  if (!buf && (AUDIO_EXTS.includes(ext) || VIDEO_EXTS.includes(ext))) {
    const cover = await extractAndCacheCover(filePath);
    if (cover.type === 'image' && cover.data) {
      const b64 = cover.data.replace(/^data:image\/\w+;base64,/, '');
      buf = Buffer.from(b64, 'base64');
      if (buf.length > 50000) {
        try {
          buf = await sharp(buf)
            .resize(maxSize, maxSize, { fit: 'outside' })
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch (e) {
          logger.warn('media', `cover downscale failed for ${filePath}`, e);
        }
      }
    }
  }

  return buf;
}

export async function getThumbnail(filePath: string, maxSize: number): Promise<string | null> {
  try {
    maxSize = sanitizeThumbSize(maxSize);
    const stamp = await sourceStamp(filePath);
    const hash = createHash('md5')
      .update(filePath + maxSize + stamp)
      .digest('hex');
    const cacheFile = join(cacheDir, `${hash}.jpg`);
    const cached = await readCache(cacheFile);
    if (cached) return cached;

    const buf = await buildThumbnail(filePath, maxSize);
    if (!buf) return null;
    await mkdir(cacheDir, { recursive: true }).catch(() => {});
    await writeFile(cacheFile, buf);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (e) {
    logger.warn('media', `getThumbnail failed for ${filePath}`, e);
    return null;
  }
}

export async function batchThumbnails(
  files: string[],
  maxSize: number
): Promise<Record<string, string>> {
  maxSize = sanitizeThumbSize(maxSize);
  const result: Record<string, string> = {};
  await mkdir(cacheDir, { recursive: true }).catch(() => {});
  const concurrency = Math.max(1, os.cpus().length - 1);
  const batchThumbnailLocks = new Set<string>();

  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const promises = batch.map(async (filePath) => {
      try {
        const stamp = await sourceStamp(filePath);
        const hash = createHash('md5')
          .update(filePath + maxSize + stamp)
          .digest('hex');
        const cacheFile = join(cacheDir, `${hash}.jpg`);
        const cached = await readCache(cacheFile);
        if (cached) {
          result[filePath] = cached;
          return;
        }

        while (batchThumbnailLocks.has(cacheFile)) {
          await new Promise<void>((resolve) => {
            const check = setInterval(() => {
              if (!batchThumbnailLocks.has(cacheFile)) {
                clearInterval(check);
                resolve();
              }
            }, 10);
            setTimeout(() => {
              clearInterval(check);
              resolve();
            }, 5000);
          });
        }
        batchThumbnailLocks.add(cacheFile);

        try {
          const buf = await buildThumbnail(filePath, maxSize);
          if (buf) {
            await writeFile(cacheFile, buf);
            result[filePath] = `data:image/jpeg;base64,${buf.toString('base64')}`;
          }
        } finally {
          batchThumbnailLocks.delete(cacheFile);
        }
      } catch (e) {
        logger.warn('media', `batch thumbnail skipped for ${filePath}`, e);
      }
    });
    await Promise.all(promises);
  }
  return result;
}
