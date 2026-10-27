import { basename, dirname, extname, join } from 'path';
import { existsSync } from 'fs';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import type { WebContents } from 'electron';
import { isProtectedPath } from '../path-policy';
import { isSafeAbsolutePath } from '../utils/validate';
import { replaceFileAtomic, safeRm } from '../utils/fs-atomic';
import { logger } from '../../shared/logger';
import {
  BATCH_IMAGES_MAX_FILES,
  IMAGE_OUTPUT_FORMATS,
  type BatchImageFileResult,
  type BatchImageProgress,
  type BatchImageRequest,
  type BatchImageResult,
  type ImageOutputFormat
} from '../../shared/types/tools';
import { IMAGE_EXTENSIONS, encodeImageBuffer } from './image-studio';

const MAX_DIMENSION = 8192;

interface ActiveJob {
  canceled: boolean;
}

const activeJobs = new Map<string, ActiveJob>();

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isOutputFormat(value: unknown): value is ImageOutputFormat {
  return typeof value === 'string' && (IMAGE_OUTPUT_FORMATS as readonly string[]).includes(value);
}

function clampQuality(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 85;
  return Math.max(1, Math.min(100, parsed));
}

function clampDimension(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const parsed = Math.round(value);
  if (parsed <= 0) return undefined;
  return Math.min(MAX_DIMENSION, parsed);
}

/** Unikalna nazwa wyjściowa; nigdy nie nadpisuje pliku źródłowego ani istniejącego. */
export function resolveBatchOutputPath(
  inputPath: string,
  outputDir: string | undefined,
  extension: string
): string {
  const dir = outputDir || dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  let candidate = join(dir, `${base}${extension}`);
  if (candidate.toLowerCase() === inputPath.toLowerCase() || existsSync(candidate)) {
    candidate = join(dir, `${base}-converted${extension}`);
    let index = 2;
    while (existsSync(candidate)) {
      candidate = join(dir, `${base}-converted-${index}${extension}`);
      index += 1;
    }
  }
  return candidate;
}

function sendProgress(sender: WebContents, payload: BatchImageProgress): void {
  if (sender.isDestroyed()) return;
  sender.send('tools:batchImagesProgress', payload);
}

async function convertOne(
  inputPath: string,
  request: Required<Pick<BatchImageRequest, 'format'>> & {
    outputDir?: string;
    quality: number;
    maxWidth?: number;
    maxHeight?: number;
  }
): Promise<{ outputPath: string; bytes: number }> {
  const info = await stat(inputPath);
  if (!info.isFile()) throw new Error('Not a file');
  const buffer = await readFile(inputPath);
  const extension = `.${request.format === 'jpeg' ? 'jpg' : request.format}`;
  const output = await encodeImageBuffer(
    buffer,
    request.format,
    request.quality,
    request.maxWidth,
    request.maxHeight
  ).toBuffer();
  const outputPath = resolveBatchOutputPath(inputPath, request.outputDir, extension);
  await mkdir(dirname(outputPath), { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpPath = join(dirname(outputPath), `.${basename(outputPath)}.${stamp}.tmp`);
  try {
    await writeFile(tmpPath, output);
    await replaceFileAtomic(tmpPath, outputPath);
  } finally {
    await safeRm(tmpPath);
  }
  return { outputPath, bytes: output.length };
}

export async function batchConvertImages(
  sender: WebContents,
  request: unknown
): Promise<BatchImageResult> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { success: false, results: [], error: 'Invalid request' };
  }
  const req = request as Partial<BatchImageRequest>;
  if (typeof req.jobId !== 'string' || !req.jobId) {
    return { success: false, results: [], error: 'Invalid job id' };
  }
  if (!Array.isArray(req.inputPaths) || req.inputPaths.length === 0) {
    return { success: false, results: [], error: 'No input files' };
  }
  if (!isOutputFormat(req.format)) {
    return { success: false, results: [], error: 'Invalid format' };
  }
  const outputDir = typeof req.outputDir === 'string' ? req.outputDir.trim() : '';
  if (outputDir && (!isSafeAbsolutePath(outputDir) || isProtectedPath(outputDir))) {
    return { success: false, results: [], error: 'Invalid output folder' };
  }

  const quality = clampQuality(req.quality);
  const maxWidth = clampDimension(req.maxWidth);
  const maxHeight = clampDimension(req.maxHeight);
  const paths = req.inputPaths.slice(0, BATCH_IMAGES_MAX_FILES);
  const active: ActiveJob = { canceled: false };
  activeJobs.set(req.jobId, active);
  const results: BatchImageFileResult[] = [];

  try {
    for (let index = 0; index < paths.length; index += 1) {
      if (active.canceled) return { success: false, canceled: true, results };
      const inputPath = paths[index];
      if (!isSafeAbsolutePath(inputPath)) {
        results.push({ path: String(inputPath), success: false, error: 'Invalid path' });
        continue;
      }
      if (!IMAGE_EXTENSIONS.has(extname(inputPath).toLowerCase())) {
        results.push({ path: inputPath, success: false, error: 'Unsupported image format' });
        continue;
      }
      sendProgress(sender, {
        jobId: req.jobId,
        index,
        total: paths.length,
        path: inputPath,
        status: 'processing'
      });
      try {
        const converted = await convertOne(inputPath, {
          format: req.format,
          outputDir: outputDir || undefined,
          quality,
          maxWidth,
          maxHeight
        });
        results.push({
          path: inputPath,
          success: true,
          outputPath: converted.outputPath,
          bytes: converted.bytes
        });
        sendProgress(sender, {
          jobId: req.jobId,
          index,
          total: paths.length,
          path: inputPath,
          status: 'done',
          outputPath: converted.outputPath,
          bytes: converted.bytes
        });
      } catch (error) {
        const message = errMsg(error);
        logger.warn('tools', `batch image failed for ${inputPath}`, error);
        results.push({ path: inputPath, success: false, error: message });
        sendProgress(sender, {
          jobId: req.jobId,
          index,
          total: paths.length,
          path: inputPath,
          status: 'error',
          error: message
        });
      }
    }
    return { success: true, results };
  } finally {
    activeJobs.delete(req.jobId);
  }
}

export function cancelBatchImages(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.canceled = true;
  return true;
}
