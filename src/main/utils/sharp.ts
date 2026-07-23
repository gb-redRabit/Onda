import sharp, { type Metadata } from 'sharp';
import { join, extname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import { logger } from './logger';

const CACHE_DIR = join(os.tmpdir(), 'onda', 'thumbs');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(filePath: string, maxSize: number, ext: string = 'jpg'): string {
  const hash = createHash('md5').update(filePath + maxSize + ext).digest('hex');
  return join(CACHE_DIR, `${hash}.${ext}`);
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.avif']);

export class SharpService {

  static async getThumbnail(filePath: string, maxSize: number = 320): Promise<Buffer | null> {
    try {
      ensureCacheDir();
      const cached = cachePath(filePath, maxSize);
      if (existsSync(cached)) return readFileSync(cached);

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

      writeFileSync(cached, buf);
      return buf;
    } catch (err) {
      logger.warn('sharp', `thumbnail failed for ${filePath}: ${err}`);
      return null;
    }
  }

  static async resize(filePath: string, width: number, quality: number = 90): Promise<Buffer | null> {
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

  static async batchThumbnails(
    files: string[],
    maxSize: number = 320,
    onProgress?: (done: number, total: number) => void
  ): Promise<Map<string, Buffer>> {
    const results = new Map<string, Buffer>();
    const concurrency = Math.max(1, os.cpus().length - 1);
    let completed = 0;

    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const promises = batch.map(async (filePath) => {
        try {
          ensureCacheDir();
          const cached = cachePath(filePath, maxSize);
          if (existsSync(cached)) {
            results.set(filePath, readFileSync(cached));
            return;
          }
          const buf = await sharp(filePath)
            .resize(maxSize, maxSize, { fit: 'outside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();
          writeFileSync(cached, buf);
          results.set(filePath, buf);
        } catch {
          // skip failed files
        }
      });
      await Promise.all(promises);
      completed += batch.length;
      onProgress?.(completed, files.length);
    }

    return results;
  }

  static async getMetadata(filePath: string): Promise<Metadata | null> {
    try {
      return await sharp(filePath).metadata();
    } catch {
      return null;
    }
  }

  static async extractEmbeddedThumbnail(filePath: string): Promise<Buffer | null> {
    try {
      const meta = await sharp(filePath).metadata();
      if (!meta) return null;
      return null;
    } catch {
      return null;
    }
  }

  static async toPngBuffer(filePath: string, maxSize?: number): Promise<Buffer | null> {
    try {
      let pipeline = sharp(filePath);
      if (maxSize) {
        pipeline = pipeline.resize(maxSize, maxSize, { fit: 'outside', withoutEnlargement: true });
      }
      return await pipeline.png().toBuffer();
    } catch {
      return null;
    }
  }
}
