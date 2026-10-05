import { ipcMain } from 'electron';
import { readFile, rename, unlink, stat, realpath } from 'fs/promises';
import { join, extname, dirname } from 'path';
import NodeID3 from 'node-id3';
import { parseFile } from 'music-metadata';
import {
  getStore,
  getCachedDuration,
  setCachedDuration,
  deleteCachedDuration,
  invalidateCachedCover,
  COVER_CACHE_MAP_KEY,
  PERSISTENT_COVER_DIR,
  clearCoverCache
} from '../cover/cover-cache';
import { errMsg } from '../../../shared/helpers';
import { logger } from '../../../shared/logger';
import { runCommand } from '../../utils/exec';
import { resolveBin } from '../../binaries';
import { getThumbnail, batchThumbnails } from './media-thumbnails';
import {
  transcodeAudioChunk,
  transcodeAudio,
  transcodeVideo,
  cleanupOldTranscodes
} from './media-transcode';
import { isSafeAbsolutePath, isSafeStringArray } from '../../utils/validate';
import { isProtectedPath, isSensitivePath } from '../../path-policy';
import { isPathWithinAllowedRoots } from '../../media/media-server';

// Mutujące operacje plikowe (zmiana nazwy, tagi, okładka) muszą przejść tę samą
// politykę co destrukcyjne kanały `fs:*`: odrzucamy wyłącznie korzenie wolumenów i
// katalogi systemowe (`isProtectedPath`). NIE używamy tu `isSensitivePath` — ta
// dotyczy przyznawania dostępu mediów (dane logowania), a nie prawa użytkownika do
// zarządzania własnymi plikami (np. `AppData\Local\Temp`).
function isProtectedTarget(filePath: string): boolean {
  return isProtectedPath(filePath) || isProtectedPath(dirname(filePath));
}
import { addAllowedRoot } from '../../media/media-server';

export async function getDuration(filePath: string): Promise<number> {
  const cached = getCachedDuration(filePath);
  if (cached) {
    try {
      const { mtimeMs } = await stat(filePath);
      if (mtimeMs <= cached.mtimeMs) return cached.duration;
    } catch {
      // plik zniknął — przechodzimy dalej i sondujemy ponownie
    }
    deleteCachedDuration(filePath);
  }

  try {
    const meta = await parseFile(filePath, { duration: true });
    const duration = meta.format?.duration || 0;
    const s = await stat(filePath).catch(() => null);
    if (s) setCachedDuration(filePath, { duration, mtimeMs: s.mtimeMs });
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
      if (s) setCachedDuration(filePath, { duration, mtimeMs: s.mtimeMs });
      return duration;
    } catch (e2) {
      logger.warn('media', `ffprobe duration failed for ${filePath}`, e2);
      return 0;
    }
  }
}

// Wspólny writer okładek używany zarówno przez handler IPC `media:writeCover`, jak i przez
// pipeline pobierania (własne pliki okładek / wyodrębnione klatki). Wbudowuje
// obraz w tagi ID3 i unieważnia cache okładek dla pliku.
export async function writeCoverToAudioFile(
  filePath: string,
  imageSource: number[] | string,
  mimeOverride?: string
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
      if (mimeOverride) mime = mimeOverride;
    }
    await NodeID3.Promise.update(
      {
        image: { mime, type: { id: 3 }, imageBuffer, description: 'Cover' }
      },
      filePath
    );
    invalidateCachedCover(filePath);
    const store = await getStore();
    const cacheMap = store.get(COVER_CACHE_MAP_KEY) as
      Record<string, { cacheFile: string; mtime: number }> | undefined;
    if (cacheMap?.[filePath]) {
      const old = cacheMap[filePath];
      const cachePath = join(PERSISTENT_COVER_DIR, old.cacheFile);
      try {
        await unlink(cachePath);
      } catch {
        // zbuforowana okładka zniknęła — można pominąć
      }
      delete cacheMap[filePath];
      store.set(COVER_CACHE_MAP_KEY, structuredClone(cacheMap));
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: errMsg(e) };
  }
}

// Miniatury systemowe (`nativeImage.createThumbnailFromPath`) potrafią wyrenderować
// podgląd PDF-ów i dokumentów Office, więc przejęty renderer mógłby odczytać dowolny
// plik na dysku. Ograniczamy je do zkanonizowanych ścieżek w dozwolonych korzeniach
// serwera mediów (biblioteka + jawnie przyznane katalogi).
async function isThumbnailPathAllowed(filePath: string): Promise<boolean> {
  try {
    return isPathWithinAllowedRoots(await realpath(filePath));
  } catch {
    return false;
  }
}

export function registerMediaHandlers(): void {
  ipcMain.handle(
    'media:getThumbnail',
    async (_event, filePath: string, maxSize: number = 320): Promise<string | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      if (!(await isThumbnailPathAllowed(filePath))) return null;
      return getThumbnail(filePath, maxSize);
    }
  );

  ipcMain.handle(
    'media:batchThumbnails',
    async (_event, files: string[], maxSize: number = 320): Promise<Record<string, string>> => {
      if (!isSafeStringArray(files)) return {};
      const allowed: string[] = [];
      for (const file of files) {
        if (isSafeAbsolutePath(file) && (await isThumbnailPathAllowed(file))) allowed.push(file);
      }
      return batchThumbnails(allowed, maxSize);
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
      if (isProtectedTarget(filePath)) return { success: false, error: 'Protected path' };
      try {
        const toWrite: Record<string, string> = {};
        for (const [key, val] of Object.entries(tags)) {
          if (val !== undefined) toWrite[key] = val;
        }
        await NodeID3.Promise.update(toWrite, filePath);
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
      if (isProtectedTarget(oldPath)) return { success: false, error: 'Protected path' };
      try {
        const safeName = newName.trim().replace(/[<>:"/\\|?*]/g, '_');
        if (!safeName) {
          return { success: false, error: 'Nazwa nie może być pusta' };
        }
        const dir = dirname(oldPath);
        const ext = extname(oldPath);
        const newPath = join(
          dir,
          safeName.toLowerCase().endsWith(ext.toLowerCase()) ? safeName : safeName + ext
        );
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
      if (isProtectedTarget(filePath)) return { success: false, error: 'Protected path' };
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
        const tags = await NodeID3.Promise.read(filePath);
        // Tylko osadzony bufor obrazu. Tag `image` typu string to ścieżka pliku
        // pochodząca z metadanych audio — czytanie jej pozwalało spreparowanemu
        // plikowi zmusić main do odczytania dowolnego pliku lokalnego i zwrócenia
        // go do renderera (eksfiltracja).
        if (tags?.image && typeof tags.image !== 'string') {
          const img = tags.image;
          if (img.imageBuffer && Buffer.isBuffer(img.imageBuffer)) {
            return { mime: img.mime || 'image/jpeg', data: Array.from(img.imageBuffer) };
          }
        }
        return null;
      } catch (e) {
        const isEnoent = Boolean(
          e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'ENOENT'
        );
        if (isEnoent) logger.info('media', `readCover file missing ${filePath}`);
        else logger.warn('media', `readCover failed for ${filePath}`, e);
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

  // posprzątaj stare transkodowane pliki przy starcie
  cleanupOldTranscodes();

  // Przyznaje serwerowi mediów dostęp do folderu pliku (lub do samego folderu),
  // wywoływane przez renderer, gdy użytkownik jawnie otwiera plik mediów.
  //
  // Nadanie jest zapisywane, więc nie może być sposobem na wręczenie serwerowi mediów
  // (a więc i przejętemu rendererowi) katalogu systemowego. `extraRoots` to
  // zwykła lista ścieżek bez innej bramy, więc poniższe sprawdzenia są wszystkim, co
  // dzieli wywołującego od dostępu do odczytu tego, co może otworzyć proces main.
  ipcMain.handle('media:grantAccess', async (_event, filePath: unknown): Promise<boolean> => {
    if (!isSafeAbsolutePath(filePath)) return false;
    if (
      isProtectedPath(filePath) ||
      isProtectedPath(dirname(filePath)) ||
      isSensitivePath(filePath)
    ) {
      logger.warn('media', `media:grantAccess rejected protected path: ${filePath}`);
      return false;
    }
    // Nadanie dla czegoś, czego nie ma, może tylko rozdąć allowlistę, więc
    // jest odrzucane od razu. Istnienie to także jedyny dowód, jaki ma
    // proces main, że to prawdziwy plik mediów, a nie zgadywanie.
    let isFile: boolean;
    try {
      isFile = (await stat(filePath)).isFile();
    } catch {
      logger.warn('media', `media:grantAccess rejected missing path: ${filePath}`);
      return false;
    }

    // Katalog zawierający to, czego odtwarzanie faktycznie potrzebuje. Dodawanie samego
    // pliku jako rootu jest przydatne tylko, gdy nic innego go nie obejmuje, a dodawanie
    // obu podwajało listę w typowym przypadku jednego utworu w folderze.
    const parent = dirname(filePath);
    if (!isFile) {
      const ok = await addAllowedRoot(filePath);
      return ok;
    }
    const parentAdded = await addAllowedRoot(parent);
    if (parentAdded) return true;
    // Rodzic jest już nadany lub lista jest pełna — sam plik wciąż
    // wystarczy, aby odtworzyć ten jeden utwór.
    return addAllowedRoot(filePath);
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

  // Wsadowe pobieranie długości (plan 1.7): masowe kolejkowanie kiedyś odpalało jedno wywołanie IPC
  // na utwór. Ograniczona współbieżność nie pozwala procesowi main uruchamiać setek
  // parsowań naraz.
  ipcMain.handle(
    'media:batchDurations',
    async (_event, paths: string[]): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      if (!Array.isArray(paths)) return out;
      const safe = paths
        .filter((p): p is string => typeof p === 'string' && isSafeAbsolutePath(p))
        .slice(0, 2000);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(8, safe.length) }, async () => {
        while (cursor < safe.length) {
          const p = safe[cursor++];
          try {
            out[p] = await getDuration(p);
          } catch {
            out[p] = 0;
          }
        }
      });
      await Promise.all(workers);
      return out;
    }
  );

  ipcMain.handle('coverCache:clear', async () => {
    try {
      const r = await clearCoverCache();
      return { success: true, removed: r.removed, bytesFreed: r.bytesFreed };
    } catch (e) {
      return { success: false, error: errMsg(e) };
    }
  });
}
