import { stat, readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { createHash } from 'crypto';
import { statSync } from 'fs';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { AUDIO_EXTS, VIDEO_EXTS } from '../../shared/constants';

const execAsync = promisify(execCb);

let _store: InstanceType<typeof import('electron-store').default> | null = null;
function getEncryptionKey(): string {
  // derive a machine-specific key from hostname + app name
  const host = os.hostname();
  return createHash('sha256').update(`onda-settings-${host}`).digest('hex').slice(0, 32);
}
export async function getStore() {
  if (!_store) {
    const { default: Store } = await import('electron-store');
    _store = new Store({ encryptionKey: getEncryptionKey() });
  }
  return _store;
}

export function getTempDir(): string {
  return join(os.tmpdir(), 'onda-covers');
}

export interface CachedCover {
  result: { type: 'video' | 'image' | null; data: string | null };
  mtimeMs: number;
}

export const coverResultCache = new Map<string, CachedCover>();
export const durationCache = new Map<string, { duration: number; mtimeMs: number }>();
export const coverCacheLocks = new Map<string, Array<() => void>>();

const CACHE_MAX_SIZE = 5000;

function evictCache(map: Map<string, unknown>, maxSize: number): void {
  if (map.size <= maxSize) return;
  const toDelete = map.size - maxSize;
  let i = 0;
  for (const key of map.keys()) {
    if (i >= toDelete) break;
    map.delete(key);
    i++;
  }
}

export function cacheSet<T>(map: Map<string, T>, key: string, value: T, maxSize: number = CACHE_MAX_SIZE): void {
  map.set(key, value);
  evictCache(map as Map<string, unknown>, maxSize);
}

export const PERSISTENT_COVER_DIR = join(getTempDir(), 'persistent');
export const COVER_CACHE_MAP_KEY = 'coverCacheMap';

export function hashPath(filePath: string): string {
  return createHash('md5').update(filePath.toLowerCase()).digest('hex');
}

export async function getPersistentCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null } | null> {
  try {
    const store = await getStore();
    const cacheMap: Record<string, { cacheFile: string; mtime: number }> | undefined = store.get(
      COVER_CACHE_MAP_KEY
    ) as any;
    const entry = cacheMap?.[filePath];
    if (!entry) return null;

    const s = await stat(filePath).catch(() => null);
    if (!s || s.mtimeMs > entry.mtime) {
      if (entry && cacheMap) {
        delete cacheMap[filePath];
        store.set(COVER_CACHE_MAP_KEY, cacheMap);
      }
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
  } catch {
    return null;
  }
}

let saveMapLock: Promise<void> | null = null;

export async function savePersistentCover(filePath: string, binary: Buffer, ext: string): Promise<void> {
  try {
    await mkdir(PERSISTENT_COVER_DIR, { recursive: true });
    const hash = hashPath(filePath);
    const cacheFile = `${hash}.${ext}`;
    const cachePath = join(PERSISTENT_COVER_DIR, cacheFile);
    await writeFile(cachePath, binary);

    while (saveMapLock) { await saveMapLock; }
    let resolveLock: () => void;
    saveMapLock = new Promise((r) => { resolveLock = r; });
    try {
      const s = await stat(filePath).catch(() => null);
      const store = await getStore();
      const cacheMap: Record<string, { cacheFile: string; mtime: number }> =
        (store.get(COVER_CACHE_MAP_KEY) as any) || {};
      cacheMap[filePath] = { cacheFile, mtime: s?.mtimeMs ?? Date.now() };
      store.set(COVER_CACHE_MAP_KEY, structuredClone(cacheMap));
    } finally {
      saveMapLock = null;
      resolveLock!();
    }
  } catch {
    // non-fatal
  }
}

function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function findSiblingVideo(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  if (!AUDIO_EXTS.includes(ext)) return null;
  const dir = dirname(filePath);
  const name = basename(filePath, ext);
  for (const vExt of VIDEO_EXTS) {
    const videoPath = join(dir, name + vExt);
    const stats = statSync(videoPath, { throwIfNoEntry: false });
    if (stats) return videoPath;
  }
  return null;
}

async function extractAudioCover(filePath: string): Promise<string | null> {
  try {
    const meta = await parseFile(filePath, { duration: false });
    if (meta.common.picture && meta.common.picture.length > 0) {
      const pic = meta.common.picture[0];
      let buf = Buffer.from(pic.data);
      const imgExt = pic.format === 'image/jpeg' ? 'jpg' : pic.format.replace('image/', '');
      try {
        const resized = await sharp(buf).resize(500, 500, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        buf = resized;
      } catch { /* use original */ }
      savePersistentCover(filePath, buf, imgExt);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  } catch {
    /* no cover in metadata */
  }
  return extractEmbeddedCover(filePath);
}

async function extractVideoFrame(filePath: string, time = '00:00:00.5'): Promise<string | null> {
  try {
    await mkdir(getTempDir(), { recursive: true });
    const outPath = join(getTempDir(), `frame_${uniqueId()}.jpg`);
    await execAsync(
      `ffmpeg -v quiet -ss ${time} -i "${filePath}" -vframes 1 -q:v 2 -update 1 "${outPath}" -y`,
      { encoding: 'utf-8', timeout: 15000, windowsHide: true }
    );
    const buf = await readFile(outPath);
    await unlink(outPath).catch(() => {});
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function extractEmbeddedCover(filePath: string): Promise<string | null> {
  try {
    await mkdir(getTempDir(), { recursive: true });
    const outPath = join(getTempDir(), `cover_${uniqueId()}.jpg`);
    await execAsync(
      `ffmpeg -v quiet -i "${filePath}" -vframes 1 -q:v 2 -update 1 "${outPath}" -y`,
      { encoding: 'utf-8', timeout: 15000, windowsHide: true }
    );
    const buf = await readFile(outPath);
    await unlink(outPath).catch(() => {});
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function extractAndCacheCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null }> {
  const siblingVideo = findSiblingVideo(filePath);
  if (siblingVideo) {
    return { type: 'video', data: siblingVideo };
  }

  while (coverCacheLocks.has(filePath)) {
    await new Promise<void>((resolve) => {
      const list = coverCacheLocks.get(filePath)!;
      list.push(resolve);
      setTimeout(resolve, 5000);
    });
  }
  const cached = await getCachedCover(filePath);
  if (cached) return cached;

  coverCacheLocks.set(filePath, []);

  try {
    const ext = extname(filePath).toLowerCase();
    let result: { type: 'video' | 'image' | null; data: string | null } = { type: null, data: null };

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
    cacheSet(coverResultCache, filePath, { result, mtimeMs: statResult?.mtimeMs ?? Date.now() });

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

export async function getCachedCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null } | null> {
  const memCached = coverResultCache.get(filePath);
  if (memCached) {
    try {
      const { mtimeMs } = await stat(filePath);
      if (mtimeMs <= memCached.mtimeMs) return memCached.result;
    } catch {
      /* file gone */
    }
    coverResultCache.delete(filePath);
  }

  const diskCached = await getPersistentCover(filePath);
  if (diskCached) {
    const s = await stat(filePath).catch(() => null);
    cacheSet(coverResultCache, filePath, { result: diskCached, mtimeMs: s?.mtimeMs ?? Date.now() });
    return diskCached;
  }

  return null;
}

// startup — clean up orphaned cover files not referenced in cache map
(async () => {
  try {
    const { readdir, rm } = await import('fs/promises');
    const store = await getStore();
    const cacheMap: Record<string, { cacheFile: string }> =
      (store.get(COVER_CACHE_MAP_KEY) as any) || {};
    const referenced = new Set(Object.values(cacheMap).map((v) => v.cacheFile));
    const entries = await readdir(PERSISTENT_COVER_DIR).catch(() => []);
    for (const entry of entries) {
      if (!referenced.has(entry)) {
        await rm(join(PERSISTENT_COVER_DIR, entry), { force: true }).catch(() => {});
      }
    }
  } catch {}
})();
