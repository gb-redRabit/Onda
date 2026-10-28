import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type {
  VideoClipThumbnailsRequest,
  VideoClipThumbnailsResult
} from '../../shared/types/tools';
import { resolveBin } from '../binaries';
import { logger } from '../../shared/logger';
import { isSafeAbsolutePath } from '../utils/validate';
import { runCommand } from '../utils/exec';
import { probeDuration } from './media-convert';
import { buildClipThumbnailArgs, MAX_CLIP_THUMBNAILS, parseFrameRate } from './video-clip-args';

const CLIP_THUMBNAIL_TIMEOUT_MS = 30_000;

async function probeVideoInfo(inputPath: string): Promise<{ duration: number; fps: number }> {
  try {
    const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
    const out = await runCommand(
      ffprobe,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=avg_frame_rate,r_frame_rate:format=duration',
        '-of',
        'json',
        '--',
        inputPath
      ],
      { timeout: 15000 }
    );
    const parsed = JSON.parse(out) as {
      streams?: { avg_frame_rate?: string; r_frame_rate?: string }[];
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    const fps =
      parseFrameRate(stream?.avg_frame_rate) || parseFrameRate(stream?.r_frame_rate) || 30;
    const rawDuration = Number(parsed.format?.duration);
    const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
    return { duration, fps };
  } catch {
    return { duration: 0, fps: 30 };
  }
}

export async function clipThumbnails(
  request: VideoClipThumbnailsRequest
): Promise<VideoClipThumbnailsResult> {
  if (!request || !isSafeAbsolutePath(request.inputPath)) {
    return { success: false, error: 'Invalid input path' };
  }
  try {
    if (!(await stat(request.inputPath)).isFile()) {
      return { success: false, error: 'Input file does not exist' };
    }
  } catch {
    return { success: false, error: 'Input file does not exist' };
  }

  let outDir = '';
  try {
    const info = await probeVideoInfo(request.inputPath);
    const duration = info.duration || (await probeDuration(request.inputPath));
    if (duration <= 0) return { success: false, error: 'Unknown video duration' };
    const start = Math.min(
      duration,
      Math.max(0, Number.isFinite(request.startSec) ? Number(request.startSec) : 0)
    );
    const end = Math.min(
      duration,
      Math.max(start + 0.001, Number.isFinite(request.endSec) ? Number(request.endSec) : duration)
    );
    const span = Math.max(0.001, end - start);
    const defaultCount = span < duration - 0.001 ? Math.max(1, Math.round(span * info.fps)) : 10;
    const count = Math.max(
      1,
      Math.min(MAX_CLIP_THUMBNAILS, Math.floor(Number(request.count) || defaultCount))
    );
    const stepSec = span / count;
    outDir = await mkdtemp(join(tmpdir(), 'onda-clip-thumbs-'));
    const args = buildClipThumbnailArgs(
      request.inputPath,
      join(outDir, 'thumb-%02d.jpg'),
      span,
      count,
      start
    );
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';

    await new Promise<void>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(ffmpeg, args, { windowsHide: true });
      } catch (error) {
        reject(new Error(`Cannot start FFmpeg: ${String(error)}`));
        return;
      }
      let stderr = '';
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // proces mógł już zakończyć się
        }
        finish(() => reject(new Error('Thumbnail generation timed out')));
      }, CLIP_THUMBNAIL_TIMEOUT_MS);

      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf-8')).slice(-2000);
      });
      child.on('error', (error) =>
        finish(() => reject(new Error(`FFmpeg failed: ${error.message}`)))
      );
      child.on('close', (code) => {
        if (code === 0) {
          finish(() => resolve());
        } else {
          finish(() => reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`)));
        }
      });
    });

    const frames: string[] = [];
    for (let index = 1; index <= count; index += 1) {
      const framePath = join(outDir, `thumb-${String(index).padStart(2, '0')}.jpg`);
      try {
        const raw = await readFile(framePath);
        frames.push(`data:image/jpeg;base64,${raw.toString('base64')}`);
      } catch {
        break;
      }
    }
    if (frames.length === 0) {
      return { success: false, error: 'No thumbnails generated' };
    }
    return { success: true, frames, fps: info.fps, duration, startSec: start, stepSec };
  } catch (error) {
    logger.warn('tools', `clip thumbnails failed for ${request.inputPath}`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (outDir) {
      await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
