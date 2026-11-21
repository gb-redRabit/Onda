import { handleIpc } from '../typed-handle';
import { readFile, rename, stat, realpath } from 'fs/promises';
import { join, extname, dirname } from 'path';
import NodeID3 from 'node-id3';
import { loadMusicMetadata } from '../../utils/lazy-music-metadata';
import {
  getCachedDuration,
  setCachedDuration,
  deleteCachedDuration,
  invalidateCachedCover,
  PERSISTENT_COVER_DIR,
  clearCoverCache
} from '../cover/cover-cache';
import { readCoverMap, writeCoverMap } from '../cover/cover-map';
import { safeUnlink } from '../../utils/fs-atomic';
import { errMsg } from '../../../shared/helpers';
import { logger } from '../../../shared/logger';
import { runCommand } from '../../utils/exec';
import { isReadableMediaPath } from '../../media/read-access';
import { isProtectedAppDataPath } from '../../utils/app-data';
import { resolveBin } from '../../binaries';
import { getThumbnail, batchThumbnails } from './media-thumbnails';
import { getWaveform } from './waveform';
import {
  transcodeAudioChunk,
  transcodeAudio,
  transcodeVideo,
  cleanupOldTranscodes
} from './media-transcode';
import { isSafeAbsolutePath, isSafeStringArray } from '../../utils/validate';
import { VIDEO_EXTS } from '../../../shared/constants';
import { isProtectedPath, isSensitivePath, isSystemTempPath } from '../../path-policy';
import { isPathWithinAllowedRoots, addAllowedRoot } from '../../media/media-server';
import { coverEmbedSupported, embedCover } from '../../media/cover-embed';
import { isWritableTagFile, writeAudioTags } from '../../tools/tag-editor';
import type { AudioTagField, AudioTagFields } from '../../../shared/types/tools';
import type { IpcTranscodeProgress } from '../../../shared/types/ipc/media';

// Mutujące operacje plikowe (zmiana nazwy, tagi, okładka) muszą przejść tę samą
// politykę co destrukcyjne kanały `fs:*`: odrzucamy wyłącznie korzenie wolumenów i
// katalogi systemowe (`isProtectedPath`). NIE używamy tu `isSensitivePath` — ta
// dotyczy przyznawania dostępu mediów (dane logowania), a nie prawa użytkownika do
// zarządzania własnymi plikami (np. `AppData\Local\Temp`).
function isProtectedTarget(filePath: string): boolean {
  // Sam plik wystarczy: polityka dopasowuje katalogi systemowe po prefiksie,
  // a korzeń wolumenu obejmuje plik o jednym segmencie. Sprawdzanie `dirname`
  // blokowało legalne pliki bezpośrednio w folderach najwyższego poziomu
  // (`D:\Wideo\song.mp3`), bo `D:\Wideo` jest dzieckiem korzenia dysku.
  return isProtectedAppDataPath(filePath) || isProtectedPath(filePath);
}

// Tylko tekstowe ramki ID3. `node-id3` traktuje string `image` jako ścieżkę do
// wczytania z dysku, więc dowolny klucz z żądania renderera był wektorem
// eksfiltracji plików (np. `{ image: 'C:\\Users\\...\\id_rsa' }`).
const ALLOWED_ID3_TEXT_TAGS = new Set([
  'title',
  'artist',
  'album',
  'albumArtist',
  'performerInfo',
  'year',
  'genre',
  'track',
  'trackNumber',
  'partOfSet',
  'discNumber',
  'composer',
  'publisher',
  'bpm',
  'comment',
  'copyright'
]);

// `writeAudioTags` (ffmpeg) obsługuje tylko te pola; reszta ramek ID3 jest
// bezpieczna wyłącznie w MP3. Mapowanie trzyma zgodność z `buildId3Tags`.
const ID3_TO_AUDIO_TAG_FIELD: Readonly<Record<string, AudioTagField>> = {
  title: 'title',
  artist: 'artist',
  album: 'album',
  albumArtist: 'albumArtist',
  performerInfo: 'albumArtist',
  genre: 'genre',
  year: 'year',
  track: 'track',
  trackNumber: 'track',
  partOfSet: 'disc',
  discNumber: 'disc'
};

const ALLOWED_COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
export const MAX_COVER_BYTES = 20 * 1024 * 1024;

// Rozszerzenie nie wystarcza: przejęty renderer mógł skopiować sekret do
// `tmp/x.jpg`. Sprawdzamy sygnaturę, zanim bajty trafią do tagu.
function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true; // JPEG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true; // PNG
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return true; // BMP
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return true; // GIF
  return (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

const VIDEO_EXT_SET = new Set(VIDEO_EXTS);

async function probeDuration(filePath: string): Promise<number> {
  const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
  const stdout = await runCommand(
    ffprobe,
    ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', '--', filePath],
    { timeout: 10000 }
  );
  return parseFloat(stdout.trim()) || 0;
}

async function rememberDuration(filePath: string, duration: number): Promise<number> {
  const s = await stat(filePath).catch(() => null);
  if (s) setCachedDuration(filePath, { duration, mtimeMs: s.mtimeMs });
  return duration;
}

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

  // music-metadata nie zna wszystkich kontenerów wideo (np. AVI kończy się
  // UnsupportedFileTypeError), a ffprobe i tak jest dla nich źródłem prawdy.
  // Dla wideo pytamy go od razu — bez fałszywego ostrzeżenia przy każdym pliku.
  if (VIDEO_EXT_SET.has(extname(filePath).toLowerCase())) {
    try {
      return await rememberDuration(filePath, await probeDuration(filePath));
    } catch (e) {
      logger.warn('media', `ffprobe duration failed for ${filePath}`, e);
      return 0;
    }
  }

  try {
    const { parseFile } = await loadMusicMetadata();
    const meta = await parseFile(filePath, { duration: true });
    return await rememberDuration(filePath, meta.format?.duration || 0);
  } catch (e) {
    logger.warn('media', `music-metadata failed for ${filePath}`, e);
    try {
      return await rememberDuration(filePath, await probeDuration(filePath));
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
    // Okładkę osadzamy TYLKO w kontenerach, które ją bezpiecznie przyjmą. Wcześniej
    // NodeID3 był wołany bezwarunkowo i dla m4a/flac/opus doklejał blok ID3 na
    // początku pliku, uszkadzając kontener. `embedCover` dobiera metodę (ID3 vs
    // ffmpeg `attached_pic`) lub rzuca dla nieobsługiwanych formatów.
    if (!coverEmbedSupported(filePath)) {
      return {
        success: false,
        error: `cover embedding unsupported for ${extname(filePath).toLowerCase() || 'unknown'}`
      };
    }
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
    if (imageBuffer.length === 0 || imageBuffer.length > MAX_COVER_BYTES) {
      return { success: false, error: 'Invalid image data' };
    }
    if (typeof imageSource === 'string' && !looksLikeImage(imageBuffer)) {
      return { success: false, error: 'Invalid image data' };
    }
    await embedCover(filePath, { buffer: imageBuffer, mime });
    invalidateCachedCover(filePath);
    // Mapa okładek żyje we własnym pliku JSON (`cover-map`), NIE w szyfrowanym
    // electron-store — wcześniej ta gałąź przepisywała całą konfigurację przy każdej
    // aktualizacji okładki.
    const cacheMap = await readCoverMap();
    const old = cacheMap[filePath];
    if (old) {
      await safeUnlink(join(PERSISTENT_COVER_DIR, old.cacheFile));
      delete cacheMap[filePath];
      await writeCoverMap(cacheMap);
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
  handleIpc(
    'media:getThumbnail',
    async (_event, filePath: string, maxSize: number = 320): Promise<string | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      if (!(await isThumbnailPathAllowed(filePath))) return null;
      return getThumbnail(filePath, maxSize);
    }
  );

  handleIpc(
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

  handleIpc(
    'media:writeTags',
    async (
      _event,
      filePath: string,
      tags: Record<string, string | undefined>
    ): Promise<{ success: boolean; error?: string }> => {
      if (!isSafeAbsolutePath(filePath)) return { success: false, error: 'Invalid path' };
      if (isProtectedTarget(filePath)) return { success: false, error: 'Protected path' };
      if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
        return { success: false, error: 'Invalid tags' };
      }
      try {
        // Symlink może wskazywać na plik systemowy; polityka musi dotyczyć
        // celu, a nie samej ścieżki z renderera.
        const real = await realpath(filePath);
        if (isProtectedTarget(real)) return { success: false, error: 'Protected path' };
        const toWrite: Record<string, string> = {};
        for (const [key, val] of Object.entries(tags)) {
          if (typeof val !== 'string' || !ALLOWED_ID3_TEXT_TAGS.has(key)) continue;
          toWrite[key] = val;
        }
        const extension = extname(real).toLowerCase();
        // `node-id3` dokleja ID3v2 na początek pliku. Dla MP3 to poprawny tag;
        // dla FLAC/M4A/OGG/OPUS/WAV niszczy kontener (nagłówek nie zaczyna się
        // już od `fLaC`/`ftyp`), więc te formaty idą przez ffmpeg `-c copy`.
        if (extension === '.mp3') {
          await NodeID3.Promise.update(toWrite, real);
          return { success: true };
        }
        if (!isWritableTagFile(real)) {
          return { success: false, error: `Unsupported audio format: ${extension || 'unknown'}` };
        }
        const fields: AudioTagFields = {};
        const unsupported: string[] = [];
        for (const [key, value] of Object.entries(toWrite)) {
          const field = ID3_TO_AUDIO_TAG_FIELD[key];
          if (!field) {
            unsupported.push(key);
            continue;
          }
          fields[field] = value;
        }
        if (unsupported.length > 0) {
          return {
            success: false,
            error: `Unsupported tag(s) for ${extension}: ${unsupported.join(', ')}`
          };
        }
        const [result] = await writeAudioTags([{ path: real, tags: fields }]);
        return result?.success
          ? { success: true }
          : { success: false, error: result?.error || 'Tag write failed' };
      } catch (e: unknown) {
        return { success: false, error: errMsg(e) };
      }
    }
  );

  handleIpc(
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

  handleIpc(
    'media:writeCover',
    async (
      _event,
      filePath: string,
      imageSource: number[] | string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!isSafeAbsolutePath(filePath)) return { success: false, error: 'Invalid path' };
      if (isProtectedTarget(filePath)) return { success: false, error: 'Protected path' };
      let realTarget: string;
      try {
        realTarget = await realpath(filePath);
      } catch {
        return { success: false, error: 'File inaccessible' };
      }
      if (isProtectedTarget(realTarget)) return { success: false, error: 'Protected path' };
      if (typeof imageSource === 'string') {
        if (!isSafeAbsolutePath(imageSource)) {
          return { success: false, error: 'Invalid image path' };
        }
        let realImage: string;
        try {
          realImage = await realpath(imageSource);
        } catch {
          return { success: false, error: 'Image file inaccessible' };
        }
        if (isSensitivePath(realImage) || isProtectedTarget(realImage)) {
          return { success: false, error: 'Invalid image path' };
        }
        if (!ALLOWED_COVER_EXTS.has(extname(realImage).toLowerCase())) {
          return { success: false, error: 'Invalid image path' };
        }
        try {
          const info = await stat(realImage);
          if (!info.isFile()) return { success: false, error: 'Invalid image path' };
          if (info.size > MAX_COVER_BYTES) {
            return { success: false, error: 'Image file too large' };
          }
        } catch {
          return { success: false, error: 'Image file inaccessible' };
        }
        return writeCoverToAudioFile(realTarget, realImage);
      }
      if (
        !Array.isArray(imageSource) ||
        imageSource.length === 0 ||
        imageSource.length > MAX_COVER_BYTES
      ) {
        return { success: false, error: 'Invalid image data' };
      }
      return writeCoverToAudioFile(realTarget, imageSource);
    }
  );

  handleIpc(
    'media:readCover',
    async (_event, filePath: string): Promise<{ mime?: string; data?: number[] } | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      if (!isReadableMediaPath(filePath)) return null;
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

  handleIpc(
    'media:checkAudioCodec',
    async (_event, filePath: string): Promise<{ codec: string; supported: boolean } | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      if (!isReadableMediaPath(filePath)) return null;
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

  handleIpc(
    'media:transcodeAudioChunk',
    async (
      _event,
      filePath: string,
      startTime: number,
      duration: number
    ): Promise<string | null> => {
      if (!isSafeAbsolutePath(filePath)) return null;
      if (!isReadableMediaPath(filePath)) return null;
      return transcodeAudioChunk(filePath, startTime, duration);
    }
  );

  handleIpc('media:transcodeAudio', async (_event, filePath: string): Promise<string | null> => {
    if (!isSafeAbsolutePath(filePath)) return null;
    if (!isReadableMediaPath(filePath)) return null;
    return transcodeAudio(filePath);
  });

  handleIpc('media:transcodeVideo', async (event, filePath: string): Promise<string | null> => {
    if (!isSafeAbsolutePath(filePath)) return null;
    if (!isReadableMediaPath(filePath)) return null;
    const sender = event.sender;
    if (typeof sender?.send !== 'function') return transcodeVideo(filePath);
    // Czas trwania jest potrzebny tylko do procentów; ffprobe i tak jest cache'owany.
    const durationSec = await getDuration(filePath);
    return transcodeVideo(filePath, {
      durationSec,
      onProgress: (progress) => {
        if (sender.isDestroyed()) return;
        const payload: IpcTranscodeProgress = { path: filePath, ...progress };
        sender.send('media:transcodeVideo:progress', payload);
      }
    });
  });

  // posprzątaj stare transkodowane pliki przy starcie
  cleanupOldTranscodes();

  // Przyznaje serwerowi mediów dostęp do folderu pliku (lub do samego folderu),
  // wywoływane przez renderer, gdy użytkownik jawnie otwiera plik mediów.
  //
  // Nadanie jest zapisywane, więc nie może być sposobem na wręczenie serwerowi mediów
  // (a więc i przejętemu rendererowi) katalogu systemowego. `extraRoots` to
  // zwykła lista ścieżek bez innej bramy, więc poniższe sprawdzenia są wszystkim, co
  // dzieli wywołującego od dostępu do odczytu tego, co może otworzyć proces main.
  handleIpc('media:grantAccess', async (_event, filePath: unknown): Promise<boolean> => {
    if (!isSafeAbsolutePath(filePath)) return false;
    let real: string;
    try {
      // Symlink może wskazywać do profilu/`.ssh`; polityka musi dotyczyć celu.
      real = await realpath(filePath);
    } catch {
      logger.warn('media', `media:grantAccess rejected missing path: ${filePath}`);
      return false;
    }
    if (!isSystemTempPath(real) && (isProtectedPath(real) || isSensitivePath(real))) {
      logger.warn('media', `media:grantAccess rejected protected path: ${real}`);
      return false;
    }
    // Plik z biblioteki jest już objęty rootem; dopisywanie jego katalogu do
    // `extraRoots` zużywałoby limit 200 bez potrzeby.
    if (isReadableMediaPath(real)) return true;
    // Nadanie dla czegoś, czego nie ma, może tylko rozdąć allowlistę, więc
    // jest odrzucane od razu. Istnienie to także jedyny dowód, jaki ma
    // proces main, że to prawdziwy plik mediów, a nie zgadywanie.
    let isFile: boolean;
    try {
      isFile = (await stat(real)).isFile();
    } catch {
      logger.warn('media', `media:grantAccess rejected missing path: ${real}`);
      return false;
    }

    // Katalog zawierający to, czego odtwarzanie faktycznie potrzebuje. Dodawanie samego
    // pliku jako rootu jest przydatne tylko, gdy nic innego go nie obejmuje, a dodawanie
    // obu podwajało listę w typowym przypadku jednego utworu w folderze.
    const parent = dirname(real);
    if (!isFile) {
      return addAllowedRoot(real, { external: true });
    }
    const parentAdded = await addAllowedRoot(parent, { external: true });
    if (parentAdded) return true;
    // Rodzic jest już nadany lub lista jest pełna — sam plik wciąż
    // wystarczy, aby odtworzyć ten jeden utwór.
    return addAllowedRoot(real, { external: true });
  });

  handleIpc('media:getDuration', async (_event, filePath: string): Promise<number> => {
    if (!isSafeAbsolutePath(filePath)) return 0;
    if (!isReadableMediaPath(filePath)) return 0;
    try {
      return await getDuration(filePath);
    } catch (err) {
      logger.warn('media', `media:getDuration failed for ${filePath}: ${err}`);
      return 0;
    }
  });

  handleIpc(
    'media:getWaveform',
    async (_event, filePath: unknown, durationSec?: unknown): Promise<number[]> => {
      if (!isSafeAbsolutePath(filePath)) return [];
      if (!isReadableMediaPath(filePath)) return [];
      const duration =
        typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : 0;
      try {
        return await getWaveform(filePath, duration);
      } catch (err) {
        logger.warn('media', `media:getWaveform failed for ${filePath}: ${err}`);
        return [];
      }
    }
  );

  // Wsadowe pobieranie długości (plan 1.7): masowe kolejkowanie kiedyś odpalało jedno wywołanie IPC
  // na utwór. Ograniczona współbieżność nie pozwala procesowi main uruchamiać setek
  // parsowań naraz.
  handleIpc(
    'media:batchDurations',
    async (_event, paths: string[]): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      if (!Array.isArray(paths)) return out;
      const safe = paths
        .filter(
          (p): p is string =>
            typeof p === 'string' && isSafeAbsolutePath(p) && isReadableMediaPath(p)
        )
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

  handleIpc('coverCache:clear', async () => {
    try {
      const r = await clearCoverCache();
      return { success: true, removed: r.removed, bytesFreed: r.bytesFreed };
    } catch (e) {
      return { success: false, error: errMsg(e) };
    }
  });
}
