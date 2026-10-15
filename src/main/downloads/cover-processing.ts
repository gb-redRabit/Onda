import { mkdir, rm, rename, unlink } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { tmpdir } from 'os';
import { logger } from '../../shared/logger';
import type { IpcCoverSpec, IpcMetaOverride } from '../../shared/types/ipc';
import { resolveBin } from '../binaries';
import { runCommand } from '../utils/exec';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../youtube/youtube-auth';
import { buildYtArgs } from '../ipc/youtube/youtube-utils';
import { writeCoverToAudioFile } from '../ipc/media/media-handlers';
import {
  buildSectionArgs,
  clipFormatSelector,
  clipCopiedCodecAcceptable,
  siblingCoverPath
} from './cover-spec';

// Źródło dla klatki-okładki (frame): to pojedynczy obrazek osadzany w tagach audio,
// więc pełny HD (1080p) w zupełności wystarcza — nie pobieramy wyższych rozdzielczości.
// (Okładki-klipy mają osobne selektory i idą w najwyższej dostępnej rozdzielczości.)
const COVER_VIDEO_FORMAT = 'bestvideo[height<=1080]+bestaudio/best';

async function workDirFor(taskId: string): Promise<string> {
  const dir = join(tmpdir(), 'onda-cover-src', taskId);
  await mkdir(dir, { recursive: true });
  return dir;
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
      url,
      '--newline',
      '--no-playlist',
      '--no-warnings',
      '-o',
      videoPath,
      '-f',
      videoFormat,
      '--merge-output-format',
      mergeFormat,
      ...extra
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
    await unlink(join(dir, base + ext)).catch(() => undefined);
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
    await unlink(filePath).catch(() => undefined);
    await rename(tmpOut, filePath);
  } catch (e) {
    await unlink(tmpOut).catch(() => undefined);
    throw e;
  }
}

interface CoverJobContext {
  taskId: string;
  url: string;
  cover: IpcCoverSpec;
  outputPath: string;
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
      const res = await writeCoverToAudioFile(ctx.outputPath, cover.customPath || '');
      if (!res.success) throw new Error(res.error || 'Failed to embed cover');
      return { status: 'embedded' };
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

      if (format === 'webm') {
        // Dla WebM: bezstratne kopiowanie VP9/AV1 (1:1 z YouTube, ułamek sekundy).
        try {
          await runCommand(
            await ffmpegBin(),
            ['-y', '-i', videoPath, '-c:v', 'copy', '-an', target],
            { timeout: 120000 }
          );
        } catch {
          await runCommand(
            await ffmpegBin(),
            ['-y', '-i', videoPath, '-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-an', target],
            { timeout: 120000 }
          );
        }
      } else {
        // Dla MP4: Chromium odtwarza AV1 (av01) i H.264 (avc1). Najpierw próbujemy
        // -c:v copy, żeby zachować źródłowy strumień 1:1 (AV1 lub H.264 z selektora
        // formatu). Tylko gdy źródło nie było ani AV1, ani H.264 (np. sam VP9),
        // enkodujemy do H.264 przez libopenh264.
        let copied = false;
        try {
          await runCommand(
            await ffmpegBin(),
            ['-y', '-i', videoPath, '-c:v', 'copy', '-an', target],
            { timeout: 120000 }
          );
          const probeBin = (await resolveBin('ffprobe')) || 'ffprobe';
          const probeOutput = await runCommand(
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
              target
            ],
            { timeout: 15000 }
          );
          if (clipCopiedCodecAcceptable(probeOutput)) {
            copied = true;
          }
        } catch {
          copied = false;
        }

        if (!copied) {
          await runCommand(
            await ffmpegBin(),
            ['-y', '-i', videoPath, '-c:v', 'libopenh264', '-b:v', '8000k', '-an', target],
            { timeout: 120000 }
          );
        }
      }
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
