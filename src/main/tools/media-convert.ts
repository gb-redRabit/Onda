import { existsSync } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import type { WebContents } from 'electron';
import { resolveBin } from '../binaries';
import { runCommand } from '../utils/exec';
import { isProtectedPath } from '../path-policy';
import { isSafeAbsolutePath } from '../utils/validate';
import { cancelAllFfmpegJobs, cancelFfmpegJob, runFfmpegJob } from './ffmpeg-job';
import type {
  MediaConvertRequest,
  MediaConvertResult,
  ToolAudioFormat,
  ToolVideoContainer
} from '../../shared/types/tools';

const AUDIO_FORMATS = new Set<ToolAudioFormat>(['mp3', 'flac', 'wav', 'ogg', 'opus', 'aac', 'm4a']);
const VIDEO_CONTAINERS = new Set<ToolVideoContainer>(['mp4', 'mkv', 'webm']);
const AUDIO_BITRATES = new Set([128, 192, 256, 320]);
export const H264_BITRATES = { high: '8M', medium: '4M', low: '2M' } as const;

export type H264Encoder = 'libx264' | 'libopenh264' | 'h264_mf' | 'mpeg4';

export function resolveConvertOutputPath(
  inputPath: string,
  outputDir: string | undefined,
  extension: string
): string {
  const dir = outputDir || dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  let candidate = join(dir, `${base}${ext}`);
  if (candidate.toLowerCase() === inputPath.toLowerCase() || existsSync(candidate)) {
    candidate = join(dir, `${base} (converted)${ext}`);
    let index = 2;
    while (existsSync(candidate)) {
      candidate = join(dir, `${base} (converted ${index})${ext}`);
      index += 1;
    }
  }
  return candidate;
}

export function buildAudioConvertArgs(
  inputPath: string,
  outputPath: string,
  format: ToolAudioFormat,
  bitrate: number
): string[] {
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-map',
    '0:a:0',
    '-vn'
  ];
  const rate = AUDIO_BITRATES.has(bitrate) ? bitrate : 192;
  switch (format) {
    case 'flac':
      args.push('-c:a', 'flac');
      break;
    case 'wav':
      args.push('-c:a', 'pcm_s16le');
      break;
    case 'ogg':
      args.push('-c:a', 'libvorbis', '-b:a', `${rate}k`);
      break;
    case 'opus':
      args.push('-c:a', 'libopus', '-b:a', `${rate}k`);
      break;
    case 'aac':
    case 'm4a':
      args.push('-c:a', 'aac', '-b:a', `${rate}k`);
      if (format === 'm4a') args.push('-movflags', '+faststart');
      break;
    case 'mp3':
    default:
      args.push('-c:a', 'libmp3lame', '-b:a', `${rate}k`, '-id3v2_version', '3');
      break;
  }
  args.push('-map_metadata', '0', '-progress', 'pipe:1', '-nostats', outputPath);
  return args;
}

export function buildVideoConvertArgs(
  inputPath: string,
  outputPath: string,
  container: ToolVideoContainer,
  quality: 'high' | 'medium' | 'low',
  encoder: H264Encoder = 'libx264'
): string[] {
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?'
  ];
  if (container === 'webm') {
    const crf = quality === 'high' ? 24 : quality === 'medium' ? 32 : 40;
    args.push(
      '-c:v',
      'libvpx-vp9',
      '-crf',
      String(crf),
      '-b:v',
      '0',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'libopus',
      '-b:a',
      '128k'
    );
  } else {
    if (encoder === 'libx264') {
      const crf = quality === 'high' ? 18 : quality === 'medium' ? 23 : 28;
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf));
    } else if (encoder === 'libopenh264' || encoder === 'h264_mf') {
      args.push('-c:v', encoder, '-b:v', H264_BITRATES[quality]);
    } else {
      const qscale = quality === 'high' ? 2 : quality === 'medium' ? 4 : 6;
      args.push('-c:v', 'mpeg4', '-q:v', String(qscale));
    }
    args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k');
    if (container === 'mp4') args.push('-movflags', '+faststart');
  }
  args.push('-map_metadata', '0', '-progress', 'pipe:1', '-nostats', outputPath);
  return args;
}

export async function detectH264Encoder(): Promise<H264Encoder> {
  try {
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    const out = await runCommand(ffmpeg, ['-hide_banner', '-encoders'], { timeout: 10000 });
    if (/\blibx264\b/.test(out)) return 'libx264';
    if (/\blibopenh264\b/.test(out)) return 'libopenh264';
    if (/\bh264_mf\b/.test(out)) return 'h264_mf';
  } catch {
    // Brak możliwości sprawdzenia — spróbuj uniwersalnego MPEG-4.
  }
  return 'mpeg4';
}

export async function probeDuration(inputPath: string): Promise<number> {
  try {
    const ffprobe = (await resolveBin('ffprobe')) || 'ffprobe';
    const out = await runCommand(
      ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        '--',
        inputPath
      ],
      { timeout: 15000 }
    );
    const value = Number(out.trim());
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function extensionFor(request: MediaConvertRequest): string {
  if (request.kind === 'audio') {
    const format =
      request.audioFormat && AUDIO_FORMATS.has(request.audioFormat) ? request.audioFormat : 'mp3';
    return `.${format}`;
  }
  const container =
    request.videoContainer && VIDEO_CONTAINERS.has(request.videoContainer)
      ? request.videoContainer
      : 'mp4';
  return `.${container}`;
}

export async function convertMedia(
  sender: WebContents,
  request: MediaConvertRequest
): Promise<MediaConvertResult> {
  if (!request || typeof request.jobId !== 'string' || !request.jobId) {
    return { success: false, error: 'Invalid job id' };
  }
  if (request.kind !== 'audio' && request.kind !== 'video') {
    return { success: false, error: 'Invalid media kind' };
  }
  if (!isSafeAbsolutePath(request.inputPath)) {
    return { success: false, error: 'Invalid input path' };
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

  const ext = extensionFor(request);
  const outputPath = resolveConvertOutputPath(request.inputPath, outputDir, ext);
  try {
    await mkdir(dirname(outputPath), { recursive: true });
  } catch (error) {
    return { success: false, error: `Cannot create output folder: ${String(error)}` };
  }

  const args =
    request.kind === 'audio'
      ? buildAudioConvertArgs(
          request.inputPath,
          outputPath,
          request.audioFormat && AUDIO_FORMATS.has(request.audioFormat)
            ? request.audioFormat
            : 'mp3',
          request.audioBitrate ?? 192
        )
      : buildVideoConvertArgs(
          request.inputPath,
          outputPath,
          request.videoContainer && VIDEO_CONTAINERS.has(request.videoContainer)
            ? request.videoContainer
            : 'mp4',
          request.videoQuality ?? 'medium',
          await detectH264Encoder()
        );

  const duration = await probeDuration(request.inputPath);
  const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';

  return runFfmpegJob({
    jobId: request.jobId,
    args,
    outputPath,
    durationSec: duration,
    sender,
    ffmpeg,
    timeoutMessage: 'Conversion timed out',
    label: 'conversion',
    logContext: request.inputPath
  });
}

export function cancelMediaConvert(jobId: string): boolean {
  return cancelFfmpegJob(jobId);
}

/** Anuluje wszystkie aktywne konwersje przy zamykaniu aplikacji. */
export function cancelAllMediaConvert(): number {
  return cancelAllFfmpegJobs();
}
