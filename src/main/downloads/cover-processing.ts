import { mkdir, rm, rename, unlink } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { tmpdir } from 'os';
import { logger } from '../../shared/logger';
import type { IpcCoverSpec, IpcMetaOverride } from '../../shared/types/ipc';
import { resolveBin } from '../binaries';
import { runCommand } from '../utils/exec';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../youtube-auth';
import { buildYtArgs } from '../ipc/youtube-utils';
import { writeCoverToAudioFile } from '../ipc/media-handlers';
import { buildSectionArgs, siblingCoverPath } from './cover-spec';

// Covers are short clips, but they deserve real quality — pull the best
// available source up to full HD (1080p).
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
    // temp dir gone — nothing to do
  }
}

// Downloads the source video (a short section, at most 480p) into `videoPath`.
async function downloadSource(url: string, videoPath: string, extra: string[]): Promise<void> {
  const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
  // May be null for anonymous public downloads — the same auth rules apply as
  // the main download pipeline.
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
      COVER_VIDEO_FORMAT,
      '--merge-output-format',
      'mp4',
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

// yt-dlp writes the embedded thumbnail to disk too (`Title.jpg` next to the
// audio). Since it is already embedded in the tags, drop the leftover image.
export async function removeThumbnailFiles(audioPath: string): Promise<void> {
  const dir = dirname(audioPath);
  const base = basename(audioPath, extname(audioPath));
  for (const ext of ['.jpg', '.jpeg', '.webp', '.png']) {
    await unlink(join(dir, base + ext)).catch(() => undefined);
  }
}

// Re-muxes the file with overridden artist/album/year tags (no re-encode).
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

export interface CoverJobContext {
  taskId: string;
  url: string;
  cover: IpcCoverSpec;
  outputPath: string;
}

// Runs the cover pipeline after the audio file has been downloaded. Thumbnails
// are already embedded by yt-dlp during download; custom files and frames are
// written into the audio tags; clips are saved as a sibling video file.
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
        // Pull a 1s section around the requested time and take its first frame
        // — avoids seeking past the end of short videos.
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
      const videoPath = join(workDir, 'clip.mp4');
      await downloadSource(ctx.url, videoPath, [
        ...buildSectionArgs(cover.clipStart ?? 0, cover.clipEnd ?? 30),
        // Pull the YouTube thumbnail too — it gets embedded into the audio
        // tags so the file has a cover even though the animated one lives in
        // the sibling video.
        '--write-thumbnail',
        '--convert-thumbnails',
        'jpg'
      ]);
      const target = siblingCoverPath(ctx.outputPath, cover.clipFormat === 'mp4' ? 'mp4' : 'webm');
      const args =
        cover.clipFormat === 'mp4'
          ? [
              '-y',
              '-i',
              videoPath,
              '-c:v',
              'libx264',
              '-crf',
              '18',
              '-preset',
              'medium',
              '-an',
              target
            ]
          : [
              '-y',
              '-i',
              videoPath,
              '-c:v',
              'libvpx',
              '-crf',
              '10',
              '-b:v',
              '2500k',
              '-an',
              target
            ];
      await runCommand(await ffmpegBin(), args, { timeout: 120000 });
      // Embed the YouTube thumbnail into the audio file (non-fatal: the
      // animated clip is already saved, and some containers can't hold tags).
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
