import { stat, readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { BrowserWindow } from 'electron';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';
import os from 'os';
import { AUDIO_EXTS, VIDEO_EXTS } from '../../../shared/constants';
import { evictCache, hashPath, uniqueId, findSiblingVideo, isEnoent } from './cover-cache-helpers';
import { clearDirContents } from '../../utils/clear-dir';
import { runCommand } from '../../utils/exec';
import { resolveBin } from '../../binaries';
import { logger } from '../../../shared/logger';
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

// Ponownie waliduje okładkę z cache w pamięci względem mtime pliku najwyżej raz na TTL,
// aby uniknąć wywołania systemowego stat() przy każdym trafieniu okładki.
const COVER_STAT_TTL_MS = 60_000;

// Nieeksportowane: mapy to szczegół implementacji. Zewnętrzni wywołujący korzystają
// przez poniższe akcesory, aby nie można było obejść niezmiennika eviction.
const coverResultCache = new Map<string, CachedCover>();
export type CachedDuration = { duration: number; mtimeMs: number };
const durationCache = new Map<string, CachedDuration>();
const coverCacheLocks = new Map<string, Array<() => void>>();

const DEFAULT_CACHE_MAX_SIZE = 5000;

// `library.coverCacheMaxEntries` (Ustawienia → Biblioteka). Stosowane przy starcie i gdy
// ustawienie się zmieni, aby suwak faktycznie zmieniał rozmiar cache okładek w pamięci.
let cacheMaxSize = DEFAULT_CACHE_MAX_SIZE;

export function applyCoverCacheSettings(maxEntries?: number): void {
  if (typeof maxEntries === 'number' && maxEntries > 0) cacheMaxSize = Math.round(maxEntries);
}

function cacheSet<T>(
  map: Map<string, T>,
  key: string,
  value: T,
  maxSize: number = cacheMaxSize
): void {
  map.set(key, value);
  evictCache(map as Map<string, unknown>, maxSize);
}

/** Unieważnia okładkę w pamięci dla jednego pliku (np. po przepisaniu jego tagów). */
export function invalidateCachedCover(filePath: string): void {
  coverResultCache.delete(filePath);
}

export function getCachedDuration(filePath: string): CachedDuration | undefined {
  return durationCache.get(filePath);
}

export function setCachedDuration(filePath: string, value: CachedDuration): void {
  cacheSet(durationCache, filePath, value);
}

export function deleteCachedDuration(filePath: string): void {
  durationCache.delete(filePath);
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
      // Fire-and-forget: okładka jest już zwrócona; persistencja nie może
      // jej opóźniać, ale intencja jest jawna, aby nie odczytano tego jako wyciekłego promise.
      void savePersistentCover(filePath, buf, imgExt);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  } catch (e) {
    if (isEnoent(e)) {
      rememberMissing(filePath);
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
    await unlink(outPath).catch(() => {
      /* best-effort */
    });
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
    await unlink(outPath).catch(() => {
      /* best-effort */
    });
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
    // Timeout bezpieczeństwa, aby oczekujący nigdy nie utknął, jeśli właściciel padnie.
    setTimeout(resolve, 5000);
  });
}

const missingCache = new Map<string, number>();
const MISSING_TTL = 5 * 60 * 1000;
/**
 * TTL decydował tylko o tym, kiedy miss był *respektowany*; same wpisy nigdy
 * nie były usuwane, więc długa sesja skanowania biblioteki z wieloma przeniesionymi lub usuniętymi
 * plikami rozrastała tę mapę tak długo, jak aplikacja pozostawała w zasobniku.
 */
const MISSING_MAX = 2000;

function rememberMissing(filePath: string): void {
  // Kolejność wstawiania jest od najstarszych, więc początek to wpis do usunięcia.
  missingCache.set(filePath, Date.now());
  while (missingCache.size > MISSING_MAX) {
    const oldest = missingCache.keys().next();
    if (oldest.done) break;
    missingCache.delete(oldest.value);
  }
}

function notifyMissing(filePath: string) {
  try {
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
  // Jeden stat: wynik jest ponownie użyty dla mtime wpisu cache niżej.
  let fileStat: Awaited<ReturnType<typeof stat>> | null = null;
  try {
    fileStat = await stat(filePath);
  } catch (e) {
    if (isEnoent(e)) {
      rememberMissing(filePath);
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

  // Poprzedni wywołujący może już wyodrębniać ten plik — poczekaj na niego i
  // użyj ponownie zbuforowanego wyniku (nawet wynik "brak okładki" jest buforowany).
  if (coverCacheLocks.has(filePath)) {
    await waitForCoverLock(filePath);
    const waited = await getCachedCover(filePath);
    if (waited) return waited;
  }

  // Zajmij blokadę synchronicznie (bez await między sprawdzeniem a ustawieniem), aby tylko
  // jeden wywołujący mógł kiedykolwiek równolegle wyodrębniać dany plik.
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

    cacheSet(coverResultCache, filePath, {
      result,
      mtimeMs: fileStat?.mtimeMs ?? Date.now(),
      checkedAt: Date.now()
    });

    if (result.type === 'image' && result.data?.startsWith('data:')) {
      const match = result.data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const imgExt = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buf = Buffer.from(match[2], 'base64');
        void savePersistentCover(filePath, buf, imgExt);
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
    // Wystarczająco świeże — pomiń wywołanie systemowe stat().
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

// Czyści nieaktualne wpisy trwałego cache. Pliki wcześniej zbuforowane jako
// okładki typu image (wyodrębnione klatki JPEG z towarzyszących wideo) trzeba
// wyodrębnić ponownie, bo `extractAndCacheCover` zwraca teraz ścieżkę wideo
// bezpośrednio. Wykrywamy to, sprawdzając, czy dowolny plik audio w bibliotece
// ma towarzyszące wideo — jeśli tak, usuwamy cały trwały cache, aby wymusić
// czyste ponowne wyodrębnienie. Cache jest wyłącznie optymalizacją wydajności
// i zostanie odbudowany przy następnym dostępie.
const STALE_CACHE_KEY = '__v2_sibling_video__';

/**
 * Jednorazowa migracja: czyści trwałe wpisy okładek sprzed zmiany
 * "zwracaj ścieżkę towarzyszącego wideo bezpośrednio", aby zostały wyodrębnione
 * na nowo w czysty sposób. Musi być wywołana jawnie przy starcie aplikacji (po
 * gotowości store) — nigdy jako efekt uboczny importu, który kiedyś usuwał pliki tylko
 * dlatego, że moduł został zaimportowany.
 */
export async function initCoverCache(): Promise<void> {
  try {
    const cacheMap = await readCoverMap();
    if (cacheMap[STALE_CACHE_KEY]) return; // already cleaned
    const { readdir, rm } = await import('fs/promises');
    const entries = await readdir(PERSISTENT_COVER_DIR).catch(() => [] as string[]);
    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue;
      await rm(join(PERSISTENT_COVER_DIR, entry), { force: true }).catch(() => {
        /* best-effort */
      });
    }
    await writeCoverMap({ [STALE_CACHE_KEY]: { cacheFile: '', mtime: Date.now() } });
    logger.info('cover', 'persistent cover cache cleared for sibling video migration');
  } catch (e) {
    logger.warn('cover', 'stale cache cleanup failed', e);
  }
}
