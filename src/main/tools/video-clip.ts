import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, extname, join } from 'path';
import type { WebContents } from 'electron';
import { resolveBin } from '../binaries';
import { logger } from '../../shared/logger';
import { isProtectedPath } from '../path-policy';
import { isSafeAbsolutePath } from '../utils/validate';
import { runCommand } from '../utils/exec';
import type {
  MediaConvertProgress,
  MediaConvertResult,
  VideoClipAudio,
  VideoClipContainer,
  VideoClipFormat,
  VideoClipMode,
  VideoClipRequest,
  VideoClipRotation,
  VideoClipThumbnailsRequest,
  VideoClipThumbnailsResult,
  VideoConcatRequest
} from '../../shared/types/tools';
import { detectH264Encoder, H264_BITRATES, probeDuration, type H264Encoder } from './media-convert';

const CLIP_CONTAINERS = new Set<VideoClipContainer>(['mp4', 'mkv', 'webm']);
const MAX_JOB_MS = 2 * 60 * 60 * 1000;
const MAX_CLIP_THUMBNAILS = 120;
const CLIP_THUMBNAIL_WIDTH = 160;
const CLIP_THUMBNAIL_TIMEOUT_MS = 30_000;

interface ActiveClipJob {
  child: ChildProcessWithoutNullStreams;
  canceled: boolean;
}

const activeJobs = new Map<string, ActiveClipJob>();

export function resolveClipOutputPath(
  inputPath: string,
  outputDir: string | undefined,
  extension: string
): string {
  const dir = outputDir || dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  let candidate = join(dir, `${base} (clip)${ext}`);
  let index = 2;
  while (existsSync(candidate)) {
    candidate = join(dir, `${base} (clip ${index})${ext}`);
    index += 1;
  }
  return candidate;
}

function rotationFilter(rotation: VideoClipRotation): string | null {
  if (rotation === 90) return 'transpose=1';
  if (rotation === 180) return 'transpose=2,transpose=2';
  if (rotation === 270) return 'transpose=2';
  return null;
}

function targetVideoBitrateKbps(targetSizeMb: number, durationSec: number): number {
  const audioKbps = 192;
  const totalKbps = (targetSizeMb * 8 * 1024) / Math.max(0.1, durationSec);
  return Math.max(200, Math.min(50000, Math.floor(totalKbps - audioKbps)));
}

export interface ClipArgsOptions {
  container: VideoClipContainer;
  mode: VideoClipMode;
  format?: VideoClipFormat;
  audio?: VideoClipAudio;
  rotation?: VideoClipRotation;
  targetSizeMb?: number;
  encoder?: H264Encoder;
}

export function buildClipArgs(
  inputPath: string,
  outputPath: string,
  startSec: number,
  endSec: number,
  options: ClipArgsOptions
): string[] {
  const duration = Math.max(0, endSec - startSec);
  const format = options.format ?? 'video';
  const audio = options.audio ?? 'keep';
  const rotation = options.rotation ?? 0;
  const rotate = rotationFilter(rotation);
  const targetSizeMb = options.targetSizeMb ?? 0;
  const requiresEncode =
    format === 'gif' ||
    options.mode === 'exact' ||
    !!rotate ||
    audio === 'mute' ||
    targetSizeMb > 0;
  const mode: VideoClipMode = requiresEncode ? 'exact' : 'copy';
  const encoder = options.encoder ?? 'libx264';
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];

  if (format === 'gif') {
    args.push('-i', inputPath, '-ss', startSec.toFixed(3), '-t', duration.toFixed(3));
    const filters = [];
    if (rotate) filters.push(rotate);
    filters.push('fps=12', 'scale=480:-2:flags=lanczos');
    args.push(
      '-filter_complex',
      `${filters.join(',')},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop',
      '0',
      '-an',
      '-progress',
      'pipe:1',
      '-nostats',
      outputPath
    );
    return args;
  }

  if (mode === 'copy') {
    args.push('-ss', startSec.toFixed(3), '-t', duration.toFixed(3), '-i', inputPath);
  } else {
    // Reencode seeks after the input so the cut is frame-accurate. It is slower
    // than copy mode, but does not snap to keyframes.
    args.push('-i', inputPath, '-ss', startSec.toFixed(3), '-t', duration.toFixed(3));
  }

  args.push('-map', '0:v:0');
  if (audio !== 'remove') args.push('-map', '0:a:0?');
  if (rotate) args.push('-vf', rotate);
  if (audio === 'mute') args.push('-af', 'volume=0');

  if (mode === 'copy') {
    args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero', '-map_metadata', '0');
    if (audio === 'remove') args.push('-an');
  } else if (options.container === 'webm') {
    if (targetSizeMb > 0) {
      const bitrate = targetVideoBitrateKbps(targetSizeMb, duration);
      args.push(
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        `${bitrate}k`,
        '-maxrate',
        `${Math.round(bitrate * 1.5)}k`,
        '-bufsize',
        `${bitrate * 2}k`
      );
    } else {
      args.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0');
    }
    args.push('-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '128k');
    if (audio === 'remove') args.push('-an');
    args.push('-map_metadata', '0');
  } else {
    if (targetSizeMb > 0) {
      const bitrate = targetVideoBitrateKbps(targetSizeMb, duration);
      args.push(
        '-c:v',
        encoder === 'mpeg4' ? 'mpeg4' : encoder,
        '-b:v',
        `${bitrate}k`,
        '-maxrate',
        `${Math.round(bitrate * 1.5)}k`,
        '-bufsize',
        `${bitrate * 2}k`
      );
      if (encoder === 'libx264') args.push('-preset', 'medium');
    } else if (encoder === 'libx264') {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20');
    } else if (encoder === 'libopenh264' || encoder === 'h264_mf') {
      args.push('-c:v', encoder, '-b:v', H264_BITRATES.medium);
    } else {
      args.push('-c:v', 'mpeg4', '-q:v', '4');
    }
    args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k');
    if (audio === 'remove') args.push('-an');
    args.push('-map_metadata', '0');
  }

  if (options.container === 'mp4') args.push('-movflags', '+faststart');
  args.push('-progress', 'pipe:1', '-nostats', outputPath);
  return args;
}

export function resolveConcatOutputPath(
  inputPaths: string[],
  outputDir: string | undefined,
  container: VideoClipContainer
): string {
  const dir = outputDir || dirname(inputPaths[0]);
  const base = basename(inputPaths[0], extname(inputPaths[0]));
  let candidate = join(dir, `${base} (concat).${container}`);
  let index = 2;
  while (existsSync(candidate)) {
    candidate = join(dir, `${base} (concat ${index}).${container}`);
    index += 1;
  }
  return candidate;
}

export function parseFrameRate(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const [rawNumerator, rawDenominator = '1'] = value.split('/');
  const numerator = Number(rawNumerator);
  const denominator = Number(rawDenominator);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
  if (numerator <= 0 || denominator <= 0) return 0;
  const fps = numerator / denominator;
  return fps > 0 && fps <= 1000 ? fps : 0;
}

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

export function buildClipThumbnailArgs(
  inputPath: string,
  outPattern: string,
  durationSec: number,
  count = 10,
  startSec = 0
): string[] {
  const safeCount = Math.max(1, Math.min(MAX_CLIP_THUMBNAILS, Math.floor(Number(count) || 10)));
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const start = Number.isFinite(startSec) && startSec > 0 ? startSec : 0;
  const fps = duration > 0 ? Math.max(0.01, safeCount / duration) : 1;
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  if (start > 0) args.push('-ss', start.toFixed(3));
  args.push(
    '-i',
    inputPath,
    '-an',
    '-sn',
    '-vf',
    `fps=${fps.toFixed(6)},scale=${CLIP_THUMBNAIL_WIDTH}:-2`,
    '-frames:v',
    String(safeCount),
    '-q:v',
    '5',
    '-start_number',
    '1',
    outPattern
  );
  return args;
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

export interface ConcatArgsOptions {
  container: VideoClipContainer;
  mode: VideoClipMode;
  audio?: VideoClipAudio;
  encoder?: H264Encoder;
}

export function buildConcatArgs(
  listPath: string,
  outputPath: string,
  options: ConcatArgsOptions
): string[] {
  const audio = options.audio ?? 'keep';
  const mode: VideoClipMode = options.mode === 'exact' || audio === 'mute' ? 'exact' : 'copy';
  const encoder = options.encoder ?? 'libx264';
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-map',
    '0:v:0'
  ];
  if (audio !== 'remove') args.push('-map', '0:a:0?');
  if (audio === 'mute') args.push('-af', 'volume=0');

  if (mode === 'copy') {
    args.push('-c', 'copy', '-map_metadata', '0');
    if (audio === 'remove') args.push('-an');
  } else if (options.container === 'webm') {
    args.push(
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '32',
      '-b:v',
      '0',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'libopus',
      '-b:a',
      '128k'
    );
    if (audio === 'remove') args.push('-an');
    args.push('-map_metadata', '0');
  } else {
    if (encoder === 'libx264') {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20');
    } else if (encoder === 'libopenh264' || encoder === 'h264_mf') {
      args.push('-c:v', encoder, '-b:v', H264_BITRATES.medium);
    } else {
      args.push('-c:v', 'mpeg4', '-q:v', '4');
    }
    args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k');
    if (audio === 'remove') args.push('-an');
    args.push('-map_metadata', '0');
  }

  if (options.container === 'mp4') args.push('-movflags', '+faststart');
  args.push('-progress', 'pipe:1', '-nostats', outputPath);
  return args;
}

function parseTimeToSeconds(value: string): number {
  const match = value.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function sendProgress(sender: WebContents, payload: MediaConvertProgress): void {
  if (sender.isDestroyed()) return;
  sender.send('tools:progress', payload);
}

export async function clipVideo(
  sender: WebContents,
  request: VideoClipRequest
): Promise<MediaConvertResult> {
  if (!request || typeof request.jobId !== 'string' || !request.jobId) {
    return { success: false, error: 'Invalid job id' };
  }
  if (!isSafeAbsolutePath(request.inputPath)) {
    return { success: false, error: 'Invalid input path' };
  }
  if (
    !Number.isFinite(request.startSec) ||
    !Number.isFinite(request.endSec) ||
    request.startSec < 0 ||
    request.endSec <= request.startSec
  ) {
    return { success: false, error: 'Invalid clip range' };
  }
  if (!CLIP_CONTAINERS.has(request.container)) {
    return { success: false, error: 'Invalid output container' };
  }
  try {
    if (!(await stat(request.inputPath)).isFile()) {
      return { success: false, error: 'Input file does not exist' };
    }
  } catch {
    return { success: false, error: 'Input file does not exist' };
  }

  const outputDir = request.outputDir?.trim() || undefined;
  if (outputDir && (!isSafeAbsolutePath(outputDir) || isProtectedPath(outputDir))) {
    return { success: false, error: 'Invalid output folder' };
  }

  const sourceDuration = await probeDuration(request.inputPath);
  let startSec = request.startSec;
  let endSec = request.endSec;
  if (sourceDuration > 0) {
    startSec = Math.min(startSec, Math.max(0, sourceDuration - 0.05));
    endSec = Math.min(endSec, sourceDuration);
  }
  if (endSec - startSec < 0.05) {
    return { success: false, error: 'Clip range is outside the video' };
  }

  const format: VideoClipFormat = request.format === 'gif' ? 'gif' : 'video';
  const outputPath = resolveClipOutputPath(
    request.inputPath,
    outputDir,
    format === 'gif' ? 'gif' : request.container
  );
  try {
    await mkdir(dirname(outputPath), { recursive: true });
  } catch (error) {
    return { success: false, error: `Cannot create output folder: ${String(error)}` };
  }

  const mode: VideoClipMode = request.mode === 'exact' ? 'exact' : 'copy';
  const audio: VideoClipAudio =
    request.audio === 'mute' || request.audio === 'remove' ? request.audio : 'keep';
  const rotation: VideoClipRotation =
    request.rotation === 90 || request.rotation === 180 || request.rotation === 270
      ? request.rotation
      : 0;
  const targetSizeMb =
    Number.isFinite(request.targetSizeMb) && (request.targetSizeMb ?? 0) > 0
      ? Math.min(1000, request.targetSizeMb ?? 0)
      : 0;
  const needsEncoder =
    format === 'video' &&
    request.container !== 'webm' &&
    (mode === 'exact' || !!rotation || audio === 'mute' || targetSizeMb > 0);
  const encoder = needsEncoder ? await detectH264Encoder() : ('libx264' as H264Encoder);
  const args = buildClipArgs(request.inputPath, outputPath, startSec, endSec, {
    container: request.container,
    mode,
    format,
    audio,
    rotation,
    targetSizeMb,
    encoder
  });
  const clipDuration = endSec - startSec;
  const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';

  return new Promise<MediaConvertResult>((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(ffmpeg, args, { windowsHide: true });
    } catch (error) {
      resolve({ success: false, error: `Cannot start FFmpeg: ${String(error)}` });
      return;
    }
    const active: ActiveClipJob = { child, canceled: false };
    activeJobs.set(request.jobId, active);

    let stdoutBuffer = '';
    let lastPercent = 0;
    let stderrTail = '';
    let settled = false;
    let timedOut = false;

    const finish = (result: MediaConvertResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeJobs.delete(request.jobId);
      if (!result.success) {
        void rm(outputPath, { force: true }).catch(() => undefined);
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      active.canceled = true;
      try {
        child.kill();
      } catch {
        // proces mógł już zakończyć się
      }
      finish({ success: false, canceled: true, error: 'Clip timed out' });
    }, MAX_JOB_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const [key, raw] = line.split('=', 2);
        if (!key) continue;
        if (key === 'out_time_us' || key === 'out_time_ms') {
          const micros = Number(raw);
          if (!Number.isFinite(micros)) continue;
          const timeSec = micros / 1_000_000;
          lastPercent = Math.min(100, (timeSec / clipDuration) * 100);
          sendProgress(sender, { jobId: request.jobId, percent: lastPercent, timeSec });
        } else if (key === 'out_time') {
          const timeSec = parseTimeToSeconds(raw);
          lastPercent = Math.min(100, (timeSec / clipDuration) * 100);
          sendProgress(sender, { jobId: request.jobId, percent: lastPercent, timeSec });
        } else if (key === 'speed') {
          sendProgress(sender, { jobId: request.jobId, percent: lastPercent, speed: raw });
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf-8')).slice(-4000);
    });

    child.on('error', (error) => {
      finish({ success: false, error: `FFmpeg failed: ${error.message}` });
    });

    child.on('close', (code) => {
      if (active.canceled) {
        finish({ success: false, canceled: true });
        return;
      }
      if (timedOut) {
        finish({ success: false, canceled: true, error: 'Clip timed out' });
        return;
      }
      if (code === 0 && existsSync(outputPath)) {
        sendProgress(sender, { jobId: request.jobId, percent: 100 });
        finish({ success: true, outputPath });
        return;
      }
      logger.warn('tools', `clip failed (${code}) for ${request.inputPath}`);
      finish({
        success: false,
        error: stderrTail.trim() || `FFmpeg exited with code ${code}`
      });
    });
  });
}

export async function concatVideos(
  sender: WebContents,
  request: VideoConcatRequest
): Promise<MediaConvertResult> {
  if (!request || typeof request.jobId !== 'string' || !request.jobId) {
    return { success: false, error: 'Invalid job id' };
  }
  if (!Array.isArray(request.inputPaths) || request.inputPaths.length < 2) {
    return { success: false, error: 'Select at least two videos' };
  }
  if (request.inputPaths.length > 50) {
    return { success: false, error: 'Too many input files' };
  }
  if (!CLIP_CONTAINERS.has(request.container)) {
    return { success: false, error: 'Invalid output container' };
  }

  const inputPaths: string[] = [];
  for (const path of request.inputPaths) {
    if (!isSafeAbsolutePath(path)) return { success: false, error: 'Invalid input path' };
    try {
      if (!(await stat(path)).isFile())
        return { success: false, error: 'Input file does not exist' };
    } catch {
      return { success: false, error: 'Input file does not exist' };
    }
    inputPaths.push(path);
  }

  const outputDir = request.outputDir?.trim() || undefined;
  if (outputDir && (!isSafeAbsolutePath(outputDir) || isProtectedPath(outputDir))) {
    return { success: false, error: 'Invalid output folder' };
  }

  const outputPath = resolveConcatOutputPath(inputPaths, outputDir, request.container);
  try {
    await mkdir(dirname(outputPath), { recursive: true });
  } catch (error) {
    return { success: false, error: `Cannot create output folder: ${String(error)}` };
  }

  const audio: VideoClipAudio =
    request.audio === 'mute' || request.audio === 'remove' ? request.audio : 'keep';
  const mode: VideoClipMode = request.mode === 'exact' || audio === 'mute' ? 'exact' : 'copy';
  const encoder =
    mode === 'exact' && request.container !== 'webm'
      ? await detectH264Encoder()
      : ('libx264' as H264Encoder);

  let listDir = '';
  try {
    listDir = await mkdtemp(join(tmpdir(), 'onda-concat-'));
    const listPath = join(listDir, 'inputs.txt');
    const content = inputPaths
      .map((path) => `file '${path.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    await writeFile(listPath, content, 'utf8');

    const durations = await Promise.all(inputPaths.map((path) => probeDuration(path)));
    const totalDuration = durations.reduce((sum, value) => sum + value, 0);
    const args = buildConcatArgs(listPath, outputPath, {
      container: request.container,
      mode,
      audio,
      encoder
    });
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';

    return await new Promise<MediaConvertResult>((resolve) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(ffmpeg, args, { windowsHide: true });
      } catch (error) {
        resolve({ success: false, error: `Cannot start FFmpeg: ${String(error)}` });
        return;
      }
      const active: ActiveClipJob = { child, canceled: false };
      activeJobs.set(request.jobId, active);

      let stdoutBuffer = '';
      let lastPercent = 0;
      let stderrTail = '';
      let settled = false;
      let timedOut = false;

      const finish = (result: MediaConvertResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        activeJobs.delete(request.jobId);
        void rm(listDir, { recursive: true, force: true }).catch(() => undefined);
        if (!result.success) {
          void rm(outputPath, { force: true }).catch(() => undefined);
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        timedOut = true;
        active.canceled = true;
        try {
          child.kill();
        } catch {
          // proces mógł już zakończyć się
        }
        finish({ success: false, canceled: true, error: 'Concat timed out' });
      }, MAX_JOB_MS);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf-8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const [key, raw] = line.split('=', 2);
          if (!key) continue;
          if (key === 'out_time_us' || key === 'out_time_ms') {
            const micros = Number(raw);
            if (!Number.isFinite(micros)) continue;
            const timeSec = micros / 1_000_000;
            lastPercent = totalDuration > 0 ? Math.min(100, (timeSec / totalDuration) * 100) : -1;
            sendProgress(sender, { jobId: request.jobId, percent: lastPercent, timeSec });
          } else if (key === 'out_time') {
            const timeSec = parseTimeToSeconds(raw);
            lastPercent = totalDuration > 0 ? Math.min(100, (timeSec / totalDuration) * 100) : -1;
            sendProgress(sender, { jobId: request.jobId, percent: lastPercent, timeSec });
          } else if (key === 'speed') {
            sendProgress(sender, { jobId: request.jobId, percent: lastPercent, speed: raw });
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString('utf-8')).slice(-4000);
      });

      child.on('error', (error) => {
        finish({ success: false, error: `FFmpeg failed: ${error.message}` });
      });

      child.on('close', (code) => {
        if (active.canceled) {
          finish({ success: false, canceled: true });
          return;
        }
        if (timedOut) {
          finish({ success: false, canceled: true, error: 'Concat timed out' });
          return;
        }
        if (code === 0 && existsSync(outputPath)) {
          sendProgress(sender, { jobId: request.jobId, percent: 100 });
          finish({ success: true, outputPath });
          return;
        }
        logger.warn('tools', `concat failed (${code})`);
        finish({
          success: false,
          error: stderrTail.trim() || `FFmpeg exited with code ${code}`
        });
      });
    });
  } catch (error) {
    if (listDir) void rm(listDir, { recursive: true, force: true }).catch(() => undefined);
    return { success: false, error: `Concat failed: ${String(error)}` };
  }
}

export function cancelVideoConcat(jobId: string): boolean {
  return cancelVideoClip(jobId);
}

export function cancelVideoClip(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.canceled = true;
  try {
    job.child.kill();
  } catch {
    // proces mógł już zakończyć się
  }
  return true;
}
