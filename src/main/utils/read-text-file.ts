import { readFile, stat } from 'fs/promises';
import { extname } from 'path';
import { logger } from '../../shared/logger';
import { isSafeAbsolutePath } from './validate';

// Subtitle/text reads return file content to the renderer, so the handler is a
// local-file-read primitive: without a shape check a compromised renderer can
// name ANY absolute path and get its bytes back. Both bounds below are what
// make it a subtitle loader instead of that primitive.

/** Extensions `subtitles:readFile` will read, and their size ceiling. */
export const SUBTITLE_EXTS = new Set(['.srt', '.ass', '.ssa', '.vtt', '.sub', '.sbv', '.ttml']);
export const SUBTITLE_MAX_BYTES = 5 * 1024 * 1024;

/** `fs:readTextFile` is used for TXT/CSV/TSV batch import — same shape rule. */
export const TEXT_EXTS = new Set(['.txt', '.csv', '.tsv']);
export const TEXT_MAX_BYTES = 5 * 1024 * 1024;

export type ReadTextFailure = 'invalid' | 'forbidden' | 'too-large' | 'unreadable';

export interface ReadTextFileDeps {
  stat: (path: string) => Promise<{ isFile(): boolean; size: number }>;
  readFile: (path: string) => Promise<Buffer>;
}

const defaultDeps: ReadTextFileDeps = { stat, readFile };

/**
 * Reads a small text file, refusing anything that is not an absolute path
 * with an allowed extension and a size under `maxBytes`.
 *
 * Subtitle files are frequently not valid UTF-8 (legacy encodings, or a
 * Latin-1 file that a player would still render), so a decode that produces
 * replacement characters falls back to latin1 rather than failing outright.
 */
export async function readTextFileWithinBounds(
  filePath: unknown,
  allowedExts: ReadonlySet<string>,
  maxBytes: number,
  label: string,
  deps: ReadTextFileDeps = defaultDeps
): Promise<{ ok: true; text: string } | { ok: false; reason: ReadTextFailure }> {
  if (!isSafeAbsolutePath(filePath)) return { ok: false, reason: 'invalid' };
  if (!allowedExts.has(extname(filePath).toLowerCase())) {
    logger.warn(label, `rejected read with disallowed extension: ${filePath}`);
    return { ok: false, reason: 'forbidden' };
  }

  let size: number;
  try {
    const info = await deps.stat(filePath);
    if (!info.isFile()) return { ok: false, reason: 'forbidden' };
    size = info.size;
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (size > maxBytes) {
    logger.warn(label, `rejected read of oversized file (${size} bytes): ${filePath}`);
    return { ok: false, reason: 'too-large' };
  }

  try {
    const buf = await deps.readFile(filePath);
    // `stat` and `readFile` race against a concurrent write; re-check so a
    // growing file cannot slip past the cap between the two calls.
    if (buf.byteLength > maxBytes) return { ok: false, reason: 'too-large' };
    const utf8 = buf.toString('utf-8');
    if (!utf8.includes('\ufffd')) return { ok: true, text: utf8 };
    return { ok: true, text: buf.toString('latin1') };
  } catch (e) {
    logger.warn(label, `read failed for ${filePath}`, e);
    return { ok: false, reason: 'unreadable' };
  }
}
