import { stat, rename, rm } from 'fs/promises';

/**
 * Rotates `file` to `file.1` (replacing the previous rotation) when it exceeds
 * `maxBytes`. Returns true when a rotation happened. Unlike truncating to zero,
 * this keeps the previous session's diagnostics available for the log viewer.
 */
export async function rotateLogIfNeeded(file: string, maxBytes: number): Promise<boolean> {
  const s = await stat(file).catch(() => null);
  if (!s || s.size <= maxBytes) return false;
  const rotated = `${file}.1`;
  await rm(rotated, { force: true });
  await rename(file, rotated);
  return true;
}
