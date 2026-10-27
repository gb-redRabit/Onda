import { basename, dirname, extname, join } from 'path';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import sharp from 'sharp';
import { isProtectedPath } from '../path-policy';
import { isSafeAbsolutePath } from '../utils/validate';
import { replaceFileAtomic, safeRm } from '../utils/fs-atomic';
import { logger } from '../../shared/logger';
import {
  IMAGE_OUTPUT_FORMATS,
  type ImageOutputFormat,
  type ImageStudioEstimateRequest,
  type ImageStudioEstimateResult,
  type ImageStudioLoadResult,
  type ImageStudioSaveRequest,
  type ImageStudioSaveResult
} from '../../shared/types/tools';

// Edytor pracuje na kopii roboczej ograniczonej do tego rozmiaru — wystarczająco
// dla okładek i zdjęć, a jednocześnie nie blokuje renderera ogromnymi canvasami.
const MAX_WORKING_DIMENSION = 4096;
const MAX_PNG_BYTES = 200 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION = 4096;

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif'
]);

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

function pngBufferFrom(value: unknown): Buffer {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Invalid image data');
  if (value.length > MAX_PNG_BYTES) throw new Error('Image data too large');
  return Buffer.from(value as number[]);
}

function encodePipeline(buffer: Buffer, format: ImageOutputFormat, quality: number) {
  const pipeline = sharp(buffer);
  switch (format) {
    case 'jpeg':
      // JPEG nie ma kanału alfa — bez spłaszczenia tło wyszłoby czarne.
      return pipeline.flatten({ background: '#ffffff' }).jpeg({ quality });
    case 'webp':
      return pipeline.webp({ quality });
    case 'avif':
      return pipeline.avif({ quality });
    case 'png':
    default:
      return pipeline.png({ compressionLevel: 9 });
  }
}

export async function readImageForEditing(rawPath: unknown): Promise<ImageStudioLoadResult> {
  if (!isSafeAbsolutePath(rawPath)) return { success: false, error: 'Invalid path' };
  if (!IMAGE_EXTENSIONS.has(extname(rawPath).toLowerCase())) {
    return { success: false, error: 'Unsupported image format' };
  }
  try {
    const info = await stat(rawPath);
    if (!info.isFile()) throw new Error('Not a file');
    const buffer = await readFile(rawPath);
    const meta = await sharp(buffer).metadata();
    const working = await sharp(buffer)
      .rotate()
      .resize({
        width: MAX_WORKING_DIMENSION,
        height: MAX_WORKING_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    return {
      success: true,
      dataUrl: `data:image/png;base64,${working.data.toString('base64')}`,
      width: working.info.width,
      height: working.info.height,
      sourceWidth: meta.width ?? working.info.width,
      sourceHeight: meta.height ?? working.info.height,
      bytes: info.size,
      format: meta.format ?? 'unknown'
    };
  } catch (error) {
    logger.warn('tools', `image read failed for ${rawPath}`, error);
    return { success: false, error: errMsg(error) };
  }
}

export async function saveEditedImage(request: unknown): Promise<ImageStudioSaveResult> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { success: false, error: 'Invalid request' };
  }
  const req = request as Partial<ImageStudioSaveRequest>;
  if (!isSafeAbsolutePath(req.outputPath)) return { success: false, error: 'Invalid output path' };
  if (isProtectedPath(req.outputPath)) return { success: false, error: 'Protected path' };
  if (!isOutputFormat(req.format)) return { success: false, error: 'Invalid format' };
  let buffer: Buffer;
  try {
    buffer = pngBufferFrom(req.png);
  } catch (error) {
    return { success: false, error: errMsg(error) };
  }
  let output: Buffer;
  try {
    output = await encodePipeline(buffer, req.format, clampQuality(req.quality)).toBuffer();
  } catch (error) {
    return { success: false, error: `Image encoding failed: ${errMsg(error)}` };
  }
  try {
    await mkdir(dirname(req.outputPath), { recursive: true });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tmpPath = join(dirname(req.outputPath), `.${basename(req.outputPath)}.${stamp}.tmp`);
    try {
      await writeFile(tmpPath, output);
      await replaceFileAtomic(tmpPath, req.outputPath);
    } finally {
      await safeRm(tmpPath);
    }
    return { success: true, outputPath: req.outputPath, bytes: output.length };
  } catch (error) {
    logger.warn('tools', `image save failed for ${req.outputPath}`, error);
    return { success: false, error: errMsg(error) };
  }
}

export async function estimateEditedImage(request: unknown): Promise<ImageStudioEstimateResult> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { success: false, error: 'Invalid request' };
  }
  const req = request as Partial<ImageStudioEstimateRequest>;
  if (!isOutputFormat(req.format)) return { success: false, error: 'Invalid format' };
  let buffer: Buffer;
  try {
    buffer = pngBufferFrom(req.png);
  } catch (error) {
    return { success: false, error: errMsg(error) };
  }
  try {
    const output = await encodePipeline(buffer, req.format, clampQuality(req.quality)).toBuffer();
    return { success: true, bytes: output.length };
  } catch (error) {
    return { success: false, error: `Image encoding failed: ${errMsg(error)}` };
  }
}

export { MAX_OUTPUT_DIMENSION };
