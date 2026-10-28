import { mkdir, rm, stat, realpath } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { tmpdir } from 'os';
import { logger } from '../../shared/logger';
import type { IpcCoverSpec, IpcMetaOverride } from '../../shared/types/ipc';
import type { IpcDownloadSource } from '../../shared/types/ipc/download';
import { resolveBin } from '../binaries';
import { runCommand } from '../utils/exec';
import { replaceFileAtomic, safeUnlink } from '../utils/fs-atomic';
import { isProtectedPath, isSensitivePath } from '../path-policy';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../youtube/youtube-auth';
import { buildYtArgs } from '../ipc/youtube/youtube-utils';
import { writeCoverToAudioFile } from '../ipc/media/media-handlers';
import {
  buildSectionArgs,
  clipFormatSelector,
  clipCopiedCodecAcceptable,
  clipCopiedCodecWebmAcceptable,
  siblingCoverPath
} from './cover-spec';

// Źródło dla klatki-okładki (frame): to pojedynczy obrazek osadzany w tagach audio,
// więc pełny HD (1080p) w zupełności wystarcza — nie pobieramy wyższych rozdzielczości.
// (Okładki-klipy mają osobne selektory i idą w najwyższej dostępnej rozdzielczości.)
const COVER_VIDEO_FORMAT = 'bestvideo[height<=1080]+bestaudio/best';

async function workDirFor(taskId: string): Promise<string> {
  // Jednorazowe sprzątanie osieroconych katalogów roboczych (po twardym zamknięciu
  // aplikacji `finally` nie zdążył usunąć `%TEMP%/onda-cover-src/*`).
  await cleanupStaleWorkDirsOnce();
  const dir = join(tmpdir(), 'onda-cover-src', taskId);
  await mkdir(dir, { recursive: true });
  return dir;
}

let staleWorkDirsCleanup: Promise<void> | null = null;
async function cleanupStaleWorkDirsOnce(): Promise<void> {
  if (!staleWorkDirsCleanup) {
    // Wspólna obietnica zamiast flagi ustawianej przed `rm`: drugie zadanie
    // nie utworzy katalogu, zanim trwające sprzątanie go usunie.
    staleWorkDirsCleanup = rm(join(tmpdir(), 'onda-cover-src'), {
      recursive: true,
      force: true
    }).catch(() => undefined);
  }
  return staleWorkDirsCleanup;
}

// Kodowanie pierwsze­go strumienia wideo w pliku (przez ffprobe).
async function probeVideoCodec(file: string): Promise<string> {
  const probeBin = (await resolveBin('ffprobe')) || 'ffprobe';
  return runCommand(
    probeBin,
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file
    ],
    { timeout: 15000 }
  );
}

// Buduje klip okładki: najpierw próbuje `-c:v copy` (1:1), a re-enkoduje TYLKO gdy
// skopiowany kodek nie mieści się w kontenerze docelowym. Wcześniej gałąź WebM
// re-enkodowała przy KAŻDYM błędzie (także timeout), marnując minuty na VP9.
async function buildClipTarget(
  videoPath: string,
  target: string,
  format: 'webm' | 'mp4'
): Promise<void> {
  const tryCopy = async (): Promise<boolean> => {
    try {
      await runCommand(await ffmpegBin(), ['-y', '-i', videoPath, '-c:v', 'copy', '-an', target], {
        timeout: 120000
      });
      const codec = await probeVideoCodec(target);
      return format === 'webm'
        ? clipCopiedCodecWebmAcceptable(codec)
        : clipCopiedCodecAcceptable(codec);
    } catch {
      return false;
    }
  };
  if (await tryCopy()) return;
  const encodeArgs =
    format === 'webm'
      ? ['-y', '-i', videoPath, '-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-an', target]
      : ['-y', '-i', videoPath, '-c:v', 'libopenh264', '-b:v', '8000k', '-an', target];
  await runCommand(await ffmpegBin(), encodeArgs, { timeout: 120000 });
}

async function cleanup(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // katalog tymczasowy zniknął — nic do zrobienia
  }
}

// Pobiera źródłowe wideo (krótki fragment, do 1080p) do `videoPath`.
async function downloadSource(
  url: string,
  videoPath: string,
  extra: string[],
  mergeFormat: 'mp4' | 'webm' | 'mkv' = 'mp4',
  videoFormat: string = COVER_VIDEO_FORMAT
): Promise<void> {
  const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
  // Może być null dla anonimowych publicznych pobrań — obowiązują te same zasady
  // autoryzacji co w głównym pipeline pobierania.
  const auth = await getYtAuthConfig();
  const args = buildYtArgs(
    [
      '--newline',
      '--no-playlist',
      '--no-warnings',
      '-o',
      videoPath,
      '-f',
      videoFormat,
      '--merge-output-format',
      mergeFormat,
      ...extra,
      // `--` kończy listę opcji — URL trafia jako pozycyjny, więc nie może zostać
      // zinterpretowany jako flaga yt-dlp.
      '--',
      url
    ],
    auth
  );
  try {
    await runCommand(bin, args, { timeout: 30 * 60 * 1000 });
  } finally {
    await cleanupYtAuthTemp(auth);
  }
}

async function ffmpegBin(): Promise<string> {
  return (await resolveBin('ffmpeg')) || 'ffmpeg';
}

// yt-dlp zapisuje osadzoną miniaturę także na dysk (`Title.jpg` obok pliku
// audio). Ponieważ jest już osadzona w tagach, usuń pozostały obraz.
export async function removeThumbnailFiles(audioPath: string): Promise<void> {
  const dir = dirname(audioPath);
  const base = basename(audioPath, extname(audioPath));
  for (const ext of ['.jpg', '.jpeg', '.webp', '.png']) {
    await safeUnlink(join(dir, base + ext));
  }
}

// Ponownie muxuje plik z nadpisanymi tagami artist/album/year (bez ponownego kodowania).
export async function applyMetadataOverride(
  filePath: string,
  meta: IpcMetaOverride
): Promise<void> {
  const tags: string[] = [];
  if (meta.artist) tags.push('-metadata', `artist=${meta.artist}`);
  if (meta.album) tags.push('-metadata', `album=${meta.album}`);
  if (meta.year) tags.push('-metadata', `date=${meta.year}`);
  if (tags.length === 0) return;
  const ext = extname(filePath);
  const tmpOut = join(dirname(filePath), `${basename(filePath, ext)}.tmp-${Date.now()}${ext}`);
  try {
    await runCommand(await ffmpegBin(), ['-y', '-i', filePath, ...tags, '-c', 'copy', tmpOut], {
      timeout: 120000
    });
    // `rename` nadpisuje istniejący cel atomowo — nie usuwamy oryginału wcześniej
    // (okno pomiędzy `unlink` a `rename` mogło zostawić użytkownika bez pliku).
    await replaceFileAtomic(tmpOut, filePath);
  } catch (e) {
    await safeUnlink(tmpOut);
    throw e;
  }
}

const COVER_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const MAX_CUSTOM_COVER_BYTES = 10 * 1024 * 1024;

// Waliduje ścieżkę okładki dostarczoną przez renderer (pole `customPath`). Bez tego
// przejęty renderer mógłby wskazać dowolny plik (klucz SSH, bazę cookies), który
// zostałby wczytany do tagów audio i wyeksfiltrowany razem z pobranym plikiem.
async function validateCustomCoverPath(imagePath: string): Promise<string | null> {
  const ext = extname(imagePath).toLowerCase();
  if (!COVER_IMAGE_EXTS.has(ext)) return `unsupported image type ${ext || '?'}`;
  let info;
  try {
    info = await stat(imagePath);
  } catch {
    return 'image not found';
  }
  if (!info.isFile()) return 'image is not a file';
  if (info.size === 0 || info.size > MAX_CUSTOM_COVER_BYTES) return 'image too large';
  const real = await realpath(imagePath).catch(() => imagePath);
  if (isProtectedPath(real) || isSensitivePath(real)) return 'image path not allowed';
  return null;
}

interface CoverJobContext {
  taskId: string;
  url: string;
  cover: IpcCoverSpec;
  outputPath: string;
  /** Tryb źródła zadania; frame/clip wymagają rozwiązywalnego przez yt-dlp URL. */
  sourceMode?: IpcDownloadSource['mode'];
}

// Uruchamia pipeline covera po pobraniu pliku audio. Miniatury są już osadzone
// przez yt-dlp podczas pobierania; pliki custom i frames są zapisywane w tagach
// audio; clipy są zapisywane jako sąsiedni plik wideo.
export async function processCover(
  ctx: CoverJobContext
): Promise<{ status: 'embedded' | 'saved' | 'error'; error?: string }> {
  const { cover } = ctx;
  try {
    if (cover.type === 'none' || cover.type === 'thumbnail') return { status: 'embedded' };
    if (cover.type === 'custom') {
      const custom = cover.customPath || '';
      const invalid = await validateCustomCoverPath(custom);
      if (invalid) throw new Error(invalid);
      const res = await writeCoverToAudioFile(ctx.outputPath, custom);
      if (!res.success) throw new Error(res.error || 'Failed to embed cover');
      return { status: 'embedded' };
    }
    // frame/clip pobierają wideo przez yt-dlp — nie zadziałają dla źródeł, których URL
    // nie jest stroną yt-dlp (provider/http/soundcloud: syntetyczny lub strumieniowy URL).
    if (
      (cover.type === 'frame' || cover.type === 'clip') &&
      ctx.sourceMode !== undefined &&
      ctx.sourceMode !== 'ytdlp'
    ) {
      return {
        status: 'error',
        error: `cover type '${cover.type}' is unavailable for ${ctx.sourceMode} sources`
      };
    }
    const workDir = await workDirFor(ctx.taskId);
    try {
      if (cover.type === 'frame') {
        // Pobiera 1-sekundowy fragment wokół żądanego czasu i bierze z niego pierwszą
        // klatkę — unika przewijania poza koniec krótkich filmów.
        const t = cover.frameTime ?? 30;
        const videoPath = join(workDir, 'frame.mp4');
        await downloadSource(ctx.url, videoPath, buildSectionArgs(t, t + 1));
        const framePath = join(workDir, 'frame.jpg');
        await runCommand(
          await ffmpegBin(),
          ['-y', '-i', videoPath, '-frames:v', '1', '-q:v', '2', framePath],
          { timeout: 60000 }
        );
        const res = await writeCoverToAudioFile(ctx.outputPath, framePath);
        if (!res.success) throw new Error(res.error || 'Failed to embed cover');
        return { status: 'embedded' };
      }
      const format = cover.clipFormat === 'mp4' ? 'mp4' : 'webm';
      // Najwyższa dostępna rozdzielczość, kodek gotowy do kopii 1:1 (patrz clipFormatSelector).
      const formatSelector = clipFormatSelector(format);
      const sourceExt = format === 'webm' ? 'webm' : 'mp4';
      const videoPath = join(workDir, `clip.${sourceExt}`);
      await downloadSource(
        ctx.url,
        videoPath,
        [
          // Pobieramy sekcję bezpośrednio jako kopię strumienia (bez --force-keyframes-at-cuts,
          // która wymuszała stratną rekompresję do 200 kb/s przez ffmpeg).
          '--download-sections',
          `*${cover.clipStart ?? 0}-${cover.clipEnd ?? 30}`,
          '--write-thumbnail',
          '--convert-thumbnails',
          'jpg'
        ],
        sourceExt,
        formatSelector
      );
      const target = siblingCoverPath(ctx.outputPath, format);

      // Kopiuje strumień 1:1; re-enkod tylko przy realnej niezgodności kodeka.
      await buildClipTarget(videoPath, target, format);

      // Osadza miniaturę YouTube w pliku audio (niekrytyczne: animowany klip jest
      // już zapisany, a niektóre kontenery nie mogą przechowywać tagów).
      const thumbPath = join(workDir, 'clip.jpg');
      try {
        const res = await writeCoverToAudioFile(ctx.outputPath, thumbPath);
        if (!res.success) {
          logger.warn('downloads', `clip thumbnail embed failed for ${ctx.taskId}: ${res.error}`);
        }
      } catch (e) {
        logger.warn('downloads', `clip thumbnail embed failed for ${ctx.taskId}`, e);
      }
      return { status: 'saved' };
    } finally {
      await cleanup(workDir);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('downloads', `cover processing failed for ${ctx.taskId}`, e);
    return { status: 'error', error: msg };
  }
}
