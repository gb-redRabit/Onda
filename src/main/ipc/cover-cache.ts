import { stat, readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { createHash, randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';
import { statSync } from 'fs';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';
import os from 'os';
import { app } from 'electron';
import { AUDIO_EXTS, VIDEO_EXTS } from '../../shared/constants';
import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';
import { logger } from '../../shared/logger';

// The electron-store encryption key is persisted as a random per-install value
// instead of being derived from the hostname (which is public and predictable).
const STORE_KEY_FILE = 'onda-store-key';
const IV_LENGTH = 16;
const PBKDF2_ITERATIONS = 10000;

type Store = InstanceType<typeof import('electron-store').default>;

let _storePromise: Promise<Store> | null = null;

// Legacy key used by earlier builds: sha256('onda-settings-' + hostname).
function legacyStoreKey(): string {
  const host = os.hostname();
  return createHash('sha256').update(`onda-settings-${host}`).digest('hex').slice(0, 32);
}

function derivePassword(key: string, iv: Buffer): Buffer {
  return pbkdf2Sync(key, iv, PBKDF2_ITERATIONS, 32, 'sha512');
}

// Mirrors conf's encryption format (aes-256-cbc): iv ':' ciphertext.
function decryptConf(data: Buffer, key: string): string | null {
  try {
    const iv = data.subarray(0, IV_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + 1);
    const decipher = createDecipheriv('aes-256-cbc', derivePassword(key, iv), iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function encryptConf(plain: string, key: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-cbc', derivePassword(key, iv), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  return Buffer.concat([iv, Buffer.from(':'), encrypted]);
}

// If a legacy hostname-keyed store exists, re-encrypt it with a fresh random
// key so existing user data survives the key change. Returns the new key.
async function migrateLegacyStore(keyPath: string): Promise<string | null> {
  const configPath = join(app.getPath('userData'), 'config.json');
  let raw: Buffer;
  try {
    raw = await readFile(configPath);
  } catch {
    return null;
  }
  // Empty file or plaintext JSON ('{') — nothing to migrate.
  if (raw.length === 0 || raw[0] === 0x7b) return null;
  if (raw.length < IV_LENGTH + 1 || raw[IV_LENGTH] !== ':'.charCodeAt(0)) return null;
  const plain = decryptConf(raw, legacyStoreKey());
  if (plain === null) return null;
  const fresh = randomBytes(32).toString('hex');
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(keyPath, fresh, { mode: 0o600 });
  await writeFile(configPath, encryptConf(plain, fresh));
  return fresh;
}

async function getOrCreateStoreKey(): Promise<string> {
  const keyPath = join(app.getPath('userData'), STORE_KEY_FILE);
  try {
    const existing = (await readFile(keyPath, 'utf-8')).trim();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;
  } catch {
    // first run
  }
  const migrated = await migrateLegacyStore(keyPath);
  if (migrated) return migrated;
  const fresh = randomBytes(32).toString('hex');
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(keyPath, fresh, { mode: 0o600 });
  return fresh;
}

export function getStore(): Promise<Store> {
  if (!_storePromise) {
    _storePromise = (async () => {
      const { default: Store } = await import('electron-store');
      const key = await getOrCreateStoreKey();
      return new Store({ encryptionKey: key });
    })();
  }
  return _storePromise;
}

export function getTempDir(): string {
  return join(os.tmpdir(), 'onda-covers');
}

export interface CachedCover {
  result: { type: 'video' | 'image' | null; data: string | null };
  mtimeMs: number;
  checkedAt: number;
}

// Re-validate a mem-cached cover against the file mtime at most once per TTL
// to avoid a stat() syscall on every cover hit.
const COVER_STAT_TTL_MS = 60_000;

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
export const COVER_CACHE_MAP_KEY = 'coverCacheMap';

export function hashPath(filePath: string): string {
  return createHash('md5').update(filePath.toLowerCase()).digest('hex');
}

export async function getPersistentCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null } | null> {
  try {
    const store = await getStore();
    const cacheMap = store.get(COVER_CACHE_MAP_KEY) as
      | Record<string, { cacheFile: string; mtime: number }>
      | undefined;
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
  } catch (e) {
    logger.warn('cover', `getPersistentCover failed for ${filePath}`, e);
    return null;
  }
}

let saveMapLock: Promise<void> | null = null;

export async function savePersistentCover(
  filePath: string,
  binary: Buffer,
  ext: string
): Promise<void> {
  try {
    await mkdir(PERSISTENT_COVER_DIR, { recursive: true });
    const hash = hashPath(filePath);
    const cacheFile = `${hash}.${ext}`;
    const cachePath = join(PERSISTENT_COVER_DIR, cacheFile);
    await writeFile(cachePath, binary);

    while (saveMapLock) {
      await saveMapLock;
    }
    let resolveLock: () => void;
    saveMapLock = new Promise((r) => {
      resolveLock = r;
    });
    try {
      const s = await stat(filePath).catch(() => null);
      const store = await getStore();
      const cacheMap =
        (store.get(COVER_CACHE_MAP_KEY) as Record<string, { cacheFile: string; mtime: number }>) ||
        {};
      cacheMap[filePath] = { cacheFile, mtime: s?.mtimeMs ?? Date.now() };
      store.set(COVER_CACHE_MAP_KEY, structuredClone(cacheMap));
    } finally {
      saveMapLock = null;
      resolveLock!();
    }
  } catch (e) {
    logger.warn('cover', `savePersistentCover failed for ${filePath}`, e);
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
      ['-v', 'quiet', '-ss', time, '-i', filePath, '-vframes', '1', '-q:v', '2', '-update', '1', outPath, '-y'],
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

export async function extractAndCacheCover(
  filePath: string
): Promise<{ type: 'video' | 'image' | null; data: string | null }> {
  const siblingVideo = findSiblingVideo(filePath);
  if (siblingVideo) {
    return { type: 'video', data: siblingVideo };
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

export async function getCachedCover(
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

// startup — clean up orphaned cover files not referenced in cache map
(async () => {
  try {
    const { readdir, rm } = await import('fs/promises');
    const store = await getStore();
    const cacheMap =
      (store.get(COVER_CACHE_MAP_KEY) as Record<string, { cacheFile: string }>) || {};
    const referenced = new Set(Object.values(cacheMap).map((v) => v.cacheFile));
    const entries = await readdir(PERSISTENT_COVER_DIR).catch(() => []);
    for (const entry of entries) {
      if (!referenced.has(entry)) {
        await rm(join(PERSISTENT_COVER_DIR, entry), { force: true }).catch(() => {});
      }
    }
  } catch (e) {
    logger.warn('cover', 'orphan cover cleanup failed', e);
  }
})();
