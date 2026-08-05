import sharp from 'sharp';
import { join, extname } from 'path';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { createHash } from 'crypto';
import os from 'os';
import { logger } from '../../shared/logger';
import { IMAGE_EXTS as SHARED_IMAGE_EXTS } from '../../shared/constants';

const CACHE_DIR = join(os.tmpdir(), 'onda', 'thumbs');

async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cachePath(filePath: string, maxSize: number, ext: string = 'jpg'): string {
  const hash = createHash('md5')
    .update(filePath + maxSize + ext)
    .digest('hex');
  return join(CACHE_DIR, `${hash}.${ext}`);
}

const IMAGE_EXTS = new Set(SHARED_IMAGE_EXTS);

export class SharpService {
  static async getThumbnail(filePath: string, maxSize: number = 320): Promise<Buffer | null> {
    try {
      await ensureCacheDir();
      const cached = cachePath(filePath, maxSize);
      try {
        await access(cached);
        return await readFile(cached);
      } catch {
        // cache miss, generate
      }

      let buf: Buffer;
      const ext = extname(filePath).toLowerCase();

      if (IMAGE_EXTS.has(ext)) {
        buf = await sharp(filePath)
          .resize(maxSize, maxSize, { fit: 'outside', withoutEnlargement: true })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer();
      } else {
        return null;
      }

      await writeFile(cached, buf);
      return buf;
    } catch (err) {
      logger.warn('sharp', `thumbnail failed for ${filePath}: ${err}`);
      return null;
    }
  }

  static async resize(
    filePath: string,
    width: number,
    quality: number = 90
  ): Promise<Buffer | null> {
    try {
      const ext = extname(filePath).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) return null;

      return await sharp(filePath)
        .resize(width, undefined, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      logger.warn('sharp', `resize failed for ${filePath}: ${err}`);
      return null;
    }
  }
}
