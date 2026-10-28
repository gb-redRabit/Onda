import { readFile, stat, realpath } from 'fs/promises';
import { basename, extname } from 'path';
import { logger } from '../../shared/logger';
import { isSafeAbsolutePath } from './validate';
import { isProtectedPath, isSensitivePath, isSystemTempPath } from '../path-policy';

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

/** Pliki sesji/cookies nigdy nie są legalnym importem TXT/CSV ani napisami. */
function isForbiddenReadName(filePath: string): boolean {
  const name = basename(filePath).toLowerCase();
  return name === 'youtube-cookies.txt' || name.startsWith('onda-yt-cookies-');
}

/**
 * Blokuje odczyt danych logowania i plików systemowych. Wyjątek dla katalogu
 * tymczasowego jest konieczny: napisy i importy często leżą w `%TEMP%`, które
 * na Windows znajduje się pod `AppData`.
 */
function isSensitiveReadPath(filePath: string): boolean {
  if (isForbiddenReadName(filePath)) return true;
  if (isSystemTempPath(filePath)) return false;
  return isProtectedPath(filePath) || isSensitivePath(filePath);
}

/**
 * Fallback dla plików napisów w starszych kodowaniach. Polskie napisy z serwisów są
 * zwykle w Windows-1250; odróżniamy je od Latin-1 po tym, że CP1250 nie produkuje znaków
 * sterujących C1 (U+0080–U+009F) — brak takich znaków oznacza spójne dekodowanie, więc
 * wybieramy CP1250. W przeciwnym razie zostaje Latin-1 (ostateczność, zawsze się udaje).
 */
function decodeLegacy(buf: Buffer): string {
  try {
    const cp1250 = new TextDecoder('windows-1250').decode(buf);
    if (!/[\u0080-\u009f]/.test(cp1250)) return cp1250;
  } catch (e) {
    logger.warn('text', 'windows-1250 decoder unavailable', e);
  }
  return buf.toString('latin1');
}

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

  // Rozwiązujemy symlink PRZED sprawdzeniem rozszerzenia i polityki ścieżek:
  // `notatki.txt -> ~/.ssh/id_rsa` nie może udawać legalnego importu.
  let realPath = filePath;
  try {
    realPath = await realpath(filePath);
  } catch {
    // brak pliku lub brak dostępu — poniższe `stat` zwróci właściwy błąd
  }

  if (isSensitiveReadPath(filePath) || isSensitiveReadPath(realPath)) {
    logger.warn(label, `rejected sensitive read: ${filePath}`);
    return { ok: false, reason: 'forbidden' };
  }
  if (!allowedExts.has(extname(realPath).toLowerCase())) {
    logger.warn(label, `rejected read with disallowed extension: ${realPath}`);
    return { ok: false, reason: 'forbidden' };
  }

  let size: number;
  try {
    const info = await deps.stat(realPath);
    if (!info.isFile()) return { ok: false, reason: 'forbidden' };
    size = info.size;
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (size > maxBytes) {
    logger.warn(label, `rejected read of oversized file (${size} bytes): ${realPath}`);
    return { ok: false, reason: 'too-large' };
  }

  try {
    const buf = await deps.readFile(realPath);
    // `stat` i `readFile` ścigają się ze współbieżnym zapisem; sprawdź ponownie,
    // aby rosnący plik nie prześlizgnął się obok limitu między tymi wywołaniami.
    if (buf.byteLength > maxBytes) return { ok: false, reason: 'too-large' };
    const utf8 = buf.toString('utf-8');
    if (!utf8.includes('\ufffd')) return { ok: true, text: utf8 };
    return { ok: true, text: decodeLegacy(buf) };
  } catch (e) {
    logger.warn(label, `read failed for ${filePath}`, e);
    return { ok: false, reason: 'unreadable' };
  }
}
