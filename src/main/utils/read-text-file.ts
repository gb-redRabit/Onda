import { readFile, stat } from 'fs/promises';
import { extname } from 'path';
import { logger } from '../../shared/logger';
import { isSafeAbsolutePath } from './validate';

// Odczyty napisów/tekstu zwracają zawartość pliku do renderera, więc handler jest
// prymitywem odczytu pliku lokalnego: bez sprawdzenia kształtu przejęty renderer
// może wskazać DOWOLNĄ ścieżkę absolutną i odzyskać jej bajty. Oba ograniczenia
// poniżej czynią z niego loader napisów, a nie taki prymityw.

/** Rozszerzenia, które odczyta `subtitles:readFile`, oraz ich limit rozmiaru. */
export const SUBTITLE_EXTS = new Set(['.srt', '.ass', '.ssa', '.vtt', '.sub', '.sbv', '.ttml']);
export const SUBTITLE_MAX_BYTES = 5 * 1024 * 1024;

/** `fs:readTextFile` jest używane do importu wsadowego TXT/CSV/TSV — ta sama zasada kształtu. */
export const TEXT_EXTS = new Set(['.txt', '.csv', '.tsv']);
export const TEXT_MAX_BYTES = 5 * 1024 * 1024;

export type ReadTextFailure = 'invalid' | 'forbidden' | 'too-large' | 'unreadable';

export interface ReadTextFileDeps {
  stat: (path: string) => Promise<{ isFile(): boolean; size: number }>;
  readFile: (path: string) => Promise<Buffer>;
}

const defaultDeps: ReadTextFileDeps = { stat, readFile };

/**
 * Odczytuje mały plik tekstowy, odrzucając wszystko, co nie jest ścieżką
 * absolutną z dozwolonym rozszerzeniem i rozmiarem poniżej `maxBytes`.
 *
 * Pliki napisów często nie są poprawnym UTF-8 (starsze kodowania lub plik
 * Latin-1, który odtwarzacz i tak by wyrenderował), więc dekodowanie dające
 * znaki zastępcze przechodzi na latin1, zamiast od razu zawodzić.
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
    // `stat` i `readFile` ścigają się ze współbieżnym zapisem; sprawdź ponownie,
    // aby rosnący plik nie prześlizgnął się obok limitu między tymi wywołaniami.
    if (buf.byteLength > maxBytes) return { ok: false, reason: 'too-large' };
    const utf8 = buf.toString('utf-8');
    if (!utf8.includes('\ufffd')) return { ok: true, text: utf8 };
    return { ok: true, text: buf.toString('latin1') };
  } catch (e) {
    logger.warn(label, `read failed for ${filePath}`, e);
    return { ok: false, reason: 'unreadable' };
  }
}
