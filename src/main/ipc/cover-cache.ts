import { stat, readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';
import os from 'os';
import { AUDIO_EXTS, VIDEO_EXTS } from '../../shared/constants';
import { evictCache, hashPath, uniqueId, findSiblingVideo, isEnoent } from './cover-cache-helpers';
import { clearDirContents } from '../utils/clear-dir';
import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';
import { logger } from '../../shared/logger';
import { readCoverMap, writeCoverMap } from './cover-map';

export { getStore } from './cover-store';
export { COVER_CACHE_MAP_KEY } from './cover-map';

export function getTempDir(): string {
  return join(os.tmpdir(), 'onda-covers');
}

interface CachedCover {
  result: { type: 'video' | 'image' | null; data: string | null };
  mtimeMs: number;
  checkedAt: number;
}

// Re-validate a mem-cached cover against the file mtime at most once per TTL
// to avoid a stat() syscall on every cover hit.
const COVER_STAT_TTL_MS = 60_000;

export const coverResultCache = new Map<string, CachedCover>();
export const durationCache = new Map<string, { duration: number; mtimeMs: number }>();
const coverCacheLocks = new Map<string, Array<() => void>>();

const CACHE_MAX_SIZE = 5000;

export function cacheSet<T>(
  map: Map<string, T>,
  key: string,
  value: T,
  maxSize: number = CACHE_MAX_SIZE
): void {
  map.set(key, value);
  evictCache(map as Map<string, unknown>, maxSize);
}

export const PERSISTENT_COVER_DIR = join(getTempDir(), 'persistent');

async function getPersistentCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null } | null> {
  try {
    const cacheMap = await readCoverMap();
    const entry = cacheMap[filePath];
    if (!entry) return null;

    const s = await stat(filePath).catch(() => null);
    if (!s || s.mtimeMs > entry.mtime) {
      delete cacheMap[filePath];
      await writeCoverMap(cacheMap);
      return null;
    }

    const cachePath = join(PERSISTENT_COVER_DIR, entry.cacheFile);
    const buf = await readFile(cachePath).catch(() => null);
    if (!buf) return null;

    const isJpeg = entry.cacheFile.endsWith('.jpg');
    const dataUrl = isJpeg
      ? `data:image/jpeg;base64,${buf.toString('base64')}`
      : `data:image/png;base64,${buf.toString('base64')}`;
    return { type: 'image', data: dataUrl };
  } catch (e) {
    logger.warn('cover', `getPersistentCover failed for ${filePath}`, e);
    return null;
  }
}

async function savePersistentCover(filePath: string, binary: Buffer, ext: string): Promise<void> {
  try {
    await mkdir(PERSISTENT_COVER_DIR, { recursive: true });
    const hash = hashPath(filePath);
    const cacheFile = `${hash}.${ext}`;
    const cachePath = join(PERSISTENT_COVER_DIR, cacheFile);
    await writeFile(cachePath, binary);

    const cacheMap = await readCoverMap();
    const s = await stat(filePath).catch(() => null);
    cacheMap[filePath] = { cacheFile, mtime: s?.mtimeMs ?? Date.now() };
    await writeCoverMap(cacheMap);
  } catch (e) {
    logger.warn('cover', `savePersistentCover failed for ${filePath}`, e);
  }
}

async function extractAudioCover(filePath: string): Promise<string | null> {
  try {
    const meta = await parseFile(filePath, { duration: false });
    if (meta.common.picture && meta.common.picture.length > 0) {
      const pic = meta.common.picture[0];
      let buf = Buffer.from(pic.data);
      const imgExt = pic.format === 'image/jpeg' ? 'jpg' : pic.format.replace('image/', '');
      try {
        const resized = await sharp(buf)
          .resize(500, 500, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        buf = resized;
      } catch (e) {
        logger.warn('cover', `cover resize failed for ${filePath}`, e);
      }
      savePersistentCover(filePath, buf, imgExt);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  } catch (e) {
    if (isEnoent(e)) {
      missingCache.set(filePath, Date.now());
      notifyMissing(filePath);
      logger.info('cover', `file missing, skip cover for ${filePath}`);
      return null;
    }
    logger.warn('cover', `no cover in metadata for ${filePath}`, e);
  }
  return extractEmbeddedCover(filePath);
}

async function extractVideoFrame(filePath: string, time = '00:00:00.5'): Promise<string | null> {
  try {
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    await mkdir(getTempDir(), { recursive: true });
    const outPath = join(getTempDir(), `frame_${uniqueId()}.jpg`);
    await runCommand(
      ffmpeg,
      [
        '-v',
        'quiet',
        '-ss',
        time,
        '-i',
        filePath,
        '-vframes',
        '1',
        '-q:v',
        '2',
        '-update',
        '1',
        outPath,
        '-y'
      ],
      { timeout: 15000 }
    );
    const buf = await readFile(outPath);
    await unlink(outPath).catch(() => {});
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (e) {
    logger.warn('cover', `extractVideoFrame failed for ${filePath}`, e);
    return null;
  }
}

async function extractEmbeddedCover(filePath: string): Promise<string | null> {
  try {
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    await mkdir(getTempDir(), { recursive: true });
    const outPath = join(getTempDir(), `cover_${uniqueId()}.jpg`);
    await runCommand(
      ffmpeg,
      ['-v', 'quiet', '-i', filePath, '-vframes', '1', '-q:v', '2', '-update', '1', outPath, '-y'],
      { timeout: 15000 }
    );
    const buf = await readFile(outPath);
    await unlink(outPath).catch(() => {});
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function waitForCoverLock(filePath: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const list = coverCacheLocks.get(filePath);
    if (!list) {
      resolve();
      return;
    }
    list.push(resolve);
    // Safety timeout so a waiter is never stuck if the owner dies.
    setTimeout(resolve, 5000);
  });
}

const missingCache = new Map<string, number>();
const MISSING_TTL = 5 * 60 * 1000;

function notifyMissing(filePath: string) {
  try {
    const { BrowserWindow } = require('electron') as typeof import('electron');
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('library:fileMissing', filePath);
    }
  } catch (e) {
    logger.warn('cover', `notifyMissing failed for ${filePath}`, e);
  }
}

export async function extractAndCacheCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null }> {
  const miss = missingCache.get(filePath);
  if (miss && Date.now() - miss < MISSING_TTL) return { type: null, data: null };
  try {
    await stat(filePath);
  } catch (e) {
    if (isEnoent(e)) {
      missingCache.set(filePath, Date.now());
      notifyMissing(filePath);
      logger.info('cover', `file missing, skip cover for ${filePath}`);
      return { type: null, data: null };
    }
  }
  const siblingVideo = findSiblingVideo(filePath);
  if (siblingVideo) {
    const result: { type: 'video'; data: string } = { type: 'video', data: siblingVideo };
    const s = await stat(siblingVideo).catch(() => null);
    cacheSet(coverResultCache, filePath, {
      result,
      mtimeMs: s?.mtimeMs ?? Date.now(),
      checkedAt: Date.now()
    });
    return result;
  }

  // A previous caller may already be extracting this file — wait for it and
  // reuse the cached result (even a "no cover" result is cached).
  if (coverCacheLocks.has(filePath)) {
    await waitForCoverLock(filePath);
    const waited = await getCachedCover(filePath);
    if (waited) return waited;
  }

  // Acquire the lock synchronously (no await between check and set) so only
  // one caller can ever extract a given file concurrently.
  coverCacheLocks.set(filePath, []);

  try {
    const cached = await getCachedCover(filePath);
    if (cached) return cached;
    const ext = extname(filePath).toLowerCase();
    let result: { type: 'video' | 'image' | null; data: string | null } = {
      type: null,
      data: null
    };

    if (AUDIO_EXTS.includes(ext)) {
      const cover = await extractAudioCover(filePath);
      if (cover) result = { type: 'image', data: cover };
    } else if (VIDEO_EXTS.includes(ext)) {
      const frame = await extractVideoFrame(filePath);
      result = frame ? { type: 'image', data: frame } : { type: null, data: null };
    } else {
      result = { type: null, data: null };
    }

    const statResult = await stat(filePath).catch(() => null);
    cacheSet(coverResultCache, filePath, {
      result,
      mtimeMs: statResult?.mtimeMs ?? Date.now(),
      checkedAt: Date.now()
    });

    if (result.type === 'image' && result.data?.startsWith('data:')) {
      const match = result.data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const imgExt = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buf = Buffer.from(match[2], 'base64');
        savePersistentCover(filePath, buf, imgExt);
      }
    }

    return result;
  } finally {
    const waiting = coverCacheLocks.get(filePath);
    coverCacheLocks.delete(filePath);
    if (waiting) waiting.forEach((r) => r());
  }
}

async function getCachedCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null } | null> {
  const memCached = coverResultCache.get(filePath);
  if (memCached) {
    // Fresh enough — skip the stat() syscall.
    if (Date.now() - memCached.checkedAt < COVER_STAT_TTL_MS) return memCached.result;
    try {
      const { mtimeMs } = await stat(filePath);
      if (mtimeMs <= memCached.mtimeMs) {
        memCached.checkedAt = Date.now();
        return memCached.result;
      }
    } catch (e) {
      logger.warn('cover', `mem cache size check failed for ${filePath}`, e);
    }
    coverResultCache.delete(filePath);
  }

  const diskCached = await getPersistentCover(filePath);
  if (diskCached) {
    const s = await stat(filePath).catch(() => null);
    cacheSet(coverResultCache, filePath, {
      result: diskCached,
      mtimeMs: s?.mtimeMs ?? Date.now(),
      checkedAt: Date.now()
    });
    return diskCached;
  }

  return null;
}

export async function clearCoverCache(): Promise<{ removed: number; bytesFreed: number }> {
  try {
    coverResultCache.clear();
    durationCache.clear();
    const { removed, bytesFreed } = await clearDirContents(PERSISTENT_COVER_DIR);
    await writeCoverMap({});
    return { removed, bytesFreed };
  } catch (e) {
    logger.warn('cover', 'clearCoverCache failed', e);
    return { removed: 0, bytesFreed: 0 };
  }
}

// Clear stale persistent cache entries.  Files that were previously cached as
// image-type covers (extracted JPEG frames from sibling videos) need to be
// re-extracted because `extractAndCacheCover` now returns the video path
// directly.  We detect this by checking whether any audio file in the library
// has a sibling video — if so, nuke the entire persistent cache to force a
// clean re-extraction.  The cache is purely a performance optimization and
// will be rebuilt on next access.
const STALE_CACHE_KEY = '__v2_sibling_video__';
(async () => {
  try {
    const cacheMap = await readCoverMap();
    if (cacheMap[STALE_CACHE_KEY]) return; // already cleaned
    const { readdir, rm } = await import('fs/promises');
    const entries = await readdir(PERSISTENT_COVER_DIR).catch(() => [] as string[]);
    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue;
      await rm(join(PERSISTENT_COVER_DIR, entry), { force: true }).catch(() => {});
    }
    await writeCoverMap({ [STALE_CACHE_KEY]: { cacheFile: '', mtime: Date.now() } });
    logger.info('cover', 'persistent cover cache cleared for sibling video migration');
  } catch (e) {
    logger.warn('cover', 'stale cache cleanup failed', e);
  }
})();
