/**
 * Filename helpers shared by the main and renderer processes. These were
 * previously duplicated (byte-for-byte in two cases), so a fix in one copy did
 * not reach the others — and their caps/fallbacks had already drifted.
 */

export interface SanitizeFilenameOptions {
  maxLength?: number;
  fallback?: string;
}

/**
 * Replaces filesystem-hostile characters with `_`, trims, drops trailing dots
 * and spaces, and caps the length. Used for download file names derived from
 * track titles.
 */
export function sanitizeFilename(input: string, options: SanitizeFilenameOptions = {}): string {
  const { maxLength = 120, fallback = 'track' } = options;
  const cleaned = (input ?? '')
    // eslint-disable-next-line no-control-regex -- control chars are invalid in file names
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[.\s]+$/, '');
  return (cleaned || fallback).slice(0, maxLength);
}

/**
 * Variant used by the direct-download pipeline: collapses whitespace around the
 * hostile characters into a single space (keeps titles readable) instead of
 * substituting an underscore.
 */
export function sanitizeFilenameSpaced(
  input: string,
  options: SanitizeFilenameOptions = {}
): string {
  const { maxLength = 180, fallback = 'download' } = options;
  return (input ?? '').replace(/\s*[\\/:*?"<>|]\s*/g, ' ').trim().slice(0, maxLength) || fallback;
}
