import { existsSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import type {
  VideoClipAudio,
  VideoClipContainer,
  VideoClipFormat,
  VideoClipMode,
  VideoClipRotation
} from '../../shared/types/tools';
import { H264_BITRATES, type H264Encoder } from './media-convert';

// Czyste funkcje budujące argumenty FFmpeg i ścieżki wyjściowe. Bez `electron`
// i bez procesów potomnych — testowane jednostkowo w `__tests__/video-clip.test.ts`.

export const CLIP_CONTAINERS = new Set<VideoClipContainer>(['mp4', 'mkv', 'webm']);
export const MAX_CLIP_THUMBNAILS = 120;
export const CLIP_THUMBNAIL_WIDTH = 160;

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

export function parseTimeToSeconds(value: string): number {
  const match = value.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
