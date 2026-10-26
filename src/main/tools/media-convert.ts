import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import type { WebContents } from 'electron';
import { resolveBin } from '../binaries';
import { logger } from '../../shared/logger';
import { runCommand } from '../utils/exec';
import { isProtectedPath } from '../path-policy';
import { isSafeAbsolutePath } from '../utils/validate';
import type {
  MediaConvertProgress,
  MediaConvertRequest,
  MediaConvertResult,
  ToolAudioFormat,
  ToolVideoContainer
} from '../../shared/types/tools';

const AUDIO_FORMATS = new Set<ToolAudioFormat>(['mp3', 'flac', 'wav', 'ogg', 'opus', 'aac', 'm4a']);
const VIDEO_CONTAINERS = new Set<ToolVideoContainer>(['mp4', 'mkv', 'webm']);
const AUDIO_BITRATES = new Set([128, 192, 256, 320]);
const MAX_JOB_MS = 2 * 60 * 60 * 1000;
export const H264_BITRATES = { high: '8M', medium: '4M', low: '2M' } as const;

export type H264Encoder = 'libx264' | 'libopenh264' | 'h264_mf' | 'mpeg4';

interface ActiveJob {
  child: ChildProcessWithoutNullStreams;
  canceled: boolean;
}

const activeJobs = new Map<string, ActiveJob>();

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

function parseTimeToSeconds(value: string): number {
  const match = value.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function sendProgress(sender: WebContents, payload: MediaConvertProgress): void {
  if (sender.isDestroyed()) return;
  sender.send('tools:progress', payload);
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

  return new Promise<MediaConvertResult>((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(ffmpeg, args, { windowsHide: true });
    } catch (error) {
      resolve({ success: false, error: `Cannot start FFmpeg: ${String(error)}` });
      return;
    }
    const active: ActiveJob = { child, canceled: false };
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
        // proces mĂłgĹ‚ juĹĽ zakoĹ„czyÄ‡ siÄ™
      }
      finish({ success: false, canceled: true, error: 'Conversion timed out' });
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
          lastPercent = duration > 0 ? Math.min(100, (timeSec / duration) * 100) : -1;
          sendProgress(sender, { jobId: request.jobId, percent: lastPercent, timeSec });
        } else if (key === 'out_time') {
          const timeSec = parseTimeToSeconds(raw);
          lastPercent = duration > 0 ? Math.min(100, (timeSec / duration) * 100) : -1;
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
        finish({ success: false, canceled: true, error: 'Conversion timed out' });
        return;
      }
      if (code === 0 && existsSync(outputPath)) {
        sendProgress(sender, { jobId: request.jobId, percent: 100 });
        finish({ success: true, outputPath });
        return;
      }
      logger.warn('tools', `conversion failed (${code}) for ${request.inputPath}`);
      finish({
        success: false,
        error: stderrTail.trim() || `FFmpeg exited with code ${code}`
      });
    });
  });
}

export function cancelMediaConvert(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.canceled = true;
  try {
    job.child.kill();
  } catch {
    // proces mĂłgĹ‚ juĹĽ zakoĹ„czyÄ‡ siÄ™
  }
  return true;
}
