import { mkdir, mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { WebContents } from 'electron';
import { logger } from '../../shared/logger';
import { isProtectedPath } from '../path-policy';
import { isSafeAbsolutePath } from '../utils/validate';
import type {
  MediaConvertResult,
  VideoClipAudio,
  VideoClipFormat,
  VideoClipMode,
  VideoClipRequest,
  VideoClipRotation,
  VideoConcatRequest
} from '../../shared/types/tools';
import { detectH264Encoder, probeDuration, type H264Encoder } from './media-convert';
import {
  buildClipArgs,
  buildConcatArgs,
  CLIP_CONTAINERS,
  resolveClipOutputPath,
  resolveConcatOutputPath
} from './video-clip-args';
import { cancelMediaJob, runMediaJob } from './video-clip-job';

// Publiczne API narzędzi wideo: walidacja żądań, ścieżki wyjściowe i uruchomienie
// FFmpeg. Czyste argumenty są w `video-clip-args.ts`, a wspólny runner w
// `video-clip-job.ts` — ten plik tylko składa je razem.
//
// Re-eksporty zachowują dotychczasowe importy (`tools-handlers`, testy).

export {
  buildClipArgs,
  buildClipThumbnailArgs,
  buildConcatArgs,
  parseFrameRate,
  resolveClipOutputPath,
  resolveConcatOutputPath,
  type ClipArgsOptions,
  type ConcatArgsOptions
} from './video-clip-args';
export { clipThumbnails } from './video-clip-thumbnails';

function resolveOutputDir(outputDir: string | undefined): string | undefined | null {
  const trimmed = outputDir?.trim() || undefined;
  if (trimmed && (!isSafeAbsolutePath(trimmed) || isProtectedPath(trimmed))) return null;
  return trimmed;
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

  const outputDir = resolveOutputDir(request.outputDir);
  if (outputDir === null) return { success: false, error: 'Invalid output folder' };

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

  return runMediaJob({
    jobId: request.jobId,
    args,
    outputPath,
    durationSec: endSec - startSec,
    sender,
    timeoutMessage: 'Clip timed out',
    label: 'clip',
    logContext: request.inputPath
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

  const outputDir = resolveOutputDir(request.outputDir);
  if (outputDir === null) return { success: false, error: 'Invalid output folder' };

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

    return await runMediaJob({
      jobId: request.jobId,
      args,
      outputPath,
      durationSec: totalDuration,
      sender,
      timeoutMessage: 'Concat timed out',
      label: 'concat',
      onFinish: () => {
        void rm(listDir, { recursive: true, force: true }).catch(() => undefined);
      }
    });
  } catch (error) {
    if (listDir) void rm(listDir, { recursive: true, force: true }).catch(() => undefined);
    logger.warn('tools', `concat failed: ${String(error)}`);
    return { success: false, error: `Concat failed: ${String(error)}` };
  }
}

export function cancelVideoConcat(jobId: string): boolean {
  return cancelMediaJob(jobId);
}

export function cancelVideoClip(jobId: string): boolean {
  return cancelMediaJob(jobId);
}
