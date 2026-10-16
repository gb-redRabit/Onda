import { app, nativeImage } from 'electron';
import { mkdir, access, readFile, writeFile, rm, mkdtemp } from 'fs/promises';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';
import os from 'os';
import { AUDIO_EXTS, VIDEO_EXTS, MAX_THUMB_SIZE } from '../../../shared/constants';
import { extractAndCacheCover } from '../cover/cover-cache';
import { SharpService } from '../../utils/sharp';
import { clearDirContents } from '../../utils/clear-dir';
import { runCommand } from '../../utils/exec';
import { resolveBin } from '../../binaries';
import { logger } from '../../../shared/logger';
import { sourceStamp } from '../../utils/source-stamp';

const cacheDir = join(os.tmpdir(), 'onda', 'thumbs');

/** Usuwa każdą zbuforowaną miniaturę (współdzielone z `SharpService`). */
export async function clearThumbnailCache(): Promise<{
  removed: number;
  bytesFreed: number;
}> {
  return clearDirContents(cacheDir);
}

function sanitizeThumbSize(size: number): number {
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

// Uwzględnij size + mtime, aby zastąpiony plik nigdy nie użył nieaktualnej miniatury.
// (Współdzielone z cache transkodowania — `utils/source-stamp`.)

/**
 * Argumenty FFmpeg do wyciągnięcia pojedynczej klatki jako JPEG. Wydzielone (czysta
 * funkcja), aby dało się je przetestować bez uruchamiania ffmpeg.
 */
export function videoFrameArgs(filePath: string, outPath: string, seek: string): string[] {
  return [
    '-v',
    'quiet',
    '-ss',
    seek,
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    '-update',
    '1',
    outPath,
    '-y'
  ];
}

async function extractVideoFrameTo(
  filePath: string,
  outPath: string,
  seek: string
): Promise<boolean> {
  const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
  try {
    await runCommand(ffmpeg, videoFrameArgs(filePath, outPath, seek), { timeout: 20000 });
    const buf = await readFile(outPath).catch(() => null);
    return !!buf && buf.length > 0;
  } catch {
    return false;
  }
}

/**
 * Miniatura z prawdziwej klatki wideo (FFmpeg), przeskalowana do `maxSize`. Najpierw 1 s
 * w głąb (unika czarnej klatki z fade-inu), a dla bardzo krótkich klipów cofa się do 0 s.
 * Zwraca `null`, gdy ffmpeg jest niedostępny albo nie uda się wyciągnąć klatki.
 */
export async function videoFrameThumbnail(
  filePath: string,
  maxSize: number
): Promise<Buffer | null> {
  const outDir = await mkdtemp(join(os.tmpdir(), 'onda-vthumb-')).catch(() => null);
  if (!outDir) return null;
  const outPath = join(outDir, 'frame.jpg');
  try {
    const ok =
      (await extractVideoFrameTo(filePath, outPath, '1')) ||
      (await extractVideoFrameTo(filePath, outPath, '0'));
    if (!ok) return null;
    const raw = await readFile(outPath);
    if (!raw.length) return null;
    return await sharp(raw)
      .resize(maxSize, maxSize, { fit: 'outside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (e) {
    logger.warn('media', `video frame thumbnail failed for ${filePath}`, e);
    return null;
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => {
      /* best-effort */
    });
  }
}

async function buildThumbnail(filePath: string, maxSize: number): Promise<Buffer | null> {
  const ext = extname(filePath).toLowerCase();
  const isAudio = AUDIO_EXTS.includes(ext);
  let buf: Buffer | null = null;

  // Wideo: prawdziwa klatka z FFmpeg ma pierwszeństwo nad miniaturą systemową. Shell na
  // Windows zwraca dla wideo często ikonę/generyk (albo klatkę zależną od kodeka), więc
  // dotychczasowy fallback FFmpeg nigdy by nie odpalił — a użytkownik chce realną klatkę.
  // Dla pozostałych plików kolejność zostaje bez zmian (system → sharp → okładka → ikona).
  if (VIDEO_EXTS.includes(ext)) {
    buf = await videoFrameThumbnail(filePath, maxSize);
  }

  if (!buf && !isAudio) {
    try {
      const thumb = await nativeImage.createThumbnailFromPath(filePath, {
        width: maxSize,
        height: maxSize
      });
      if (!thumb.isEmpty()) {
        buf = thumb.toJPEG(85);
      }
    } catch {
      // Brak miniatury systemowej (skróty, dokumenty biurowe, …) — poniższy fallback
      // ikony shell dostarcza ikonę, więc nie warto tego logować.
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

  // Ostatnia deska ratunku dla plików niebędących mediami (np. .lnk, .docx, .pdf): użyj
  // powiązanej ikony pliku z shella, aby explorer nigdy nie pokazywał pustego wiersza.
  if (!buf && !AUDIO_EXTS.includes(ext) && !VIDEO_EXTS.includes(ext)) {
    try {
      const icon = await app.getFileIcon(filePath, { size: 'normal' });
      if (!icon.isEmpty()) buf = icon.toJPEG(85);
    } catch {
      // Brak powiązanej ikony (lub shell niedostępny) — pozostaw miniaturę pustą.
    }
  }

  return buf;
}

async function thumbnailCachePath(filePath: string, maxSize: number): Promise<string> {
  const stamp = await sourceStamp(filePath);
  const hash = createHash('md5')
    .update(filePath + maxSize + stamp)
    .digest('hex');
  return join(cacheDir, `${hash}.jpg`);
}

// Deduplikacja budowy tej samej miniatury MIĘDZY wywołaniami (getThumbnail +
// batchThumbnails). Wcześniej `batchThumbnails` miał lokalny zbiór blokad z
// odpytywaniem `setInterval` co 10 ms (busy-wait) i nie dzielił go z innymi
// wywołaniami, więc dwie partie budowały ten sam plik równolegle.
const inflightThumbs = new Map<string, Promise<string | null>>();

function buildAndCacheThumbnail(
  filePath: string,
  maxSize: number,
  cacheFile: string
): Promise<string | null> {
  const existing = inflightThumbs.get(cacheFile);
  if (existing) return existing;
  const p = (async (): Promise<string | null> => {
    await mkdir(cacheDir, { recursive: true }).catch(() => {
      /* best-effort */
    });
    const buf = await buildThumbnail(filePath, maxSize);
    if (!buf) return null;
    await writeFile(cacheFile, buf);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  })();
  inflightThumbs.set(cacheFile, p);
  void p.then(
    () => {
      if (inflightThumbs.get(cacheFile) === p) inflightThumbs.delete(cacheFile);
    },
    () => {
      if (inflightThumbs.get(cacheFile) === p) inflightThumbs.delete(cacheFile);
    }
  );
  return p;
}

export async function getThumbnail(filePath: string, maxSize: number): Promise<string | null> {
  try {
    maxSize = sanitizeThumbSize(maxSize);
    const cacheFile = await thumbnailCachePath(filePath, maxSize);
    const cached = await readCache(cacheFile);
    if (cached) return cached;
    return await buildAndCacheThumbnail(filePath, maxSize, cacheFile);
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
  await mkdir(cacheDir, { recursive: true }).catch(() => {
    /* best-effort */
  });
  const concurrency = Math.max(1, os.cpus().length - 1);

  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (filePath) => {
        try {
          const cacheFile = await thumbnailCachePath(filePath, maxSize);
          const cached = await readCache(cacheFile);
          if (cached) {
            result[filePath] = cached;
            return;
          }
          const dataUrl = await buildAndCacheThumbnail(filePath, maxSize, cacheFile);
          if (dataUrl) result[filePath] = dataUrl;
        } catch (e) {
          logger.warn('media', `batch thumbnail skipped for ${filePath}`, e);
        }
      })
    );
  }
  return result;
}
