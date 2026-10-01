import { stat, rename, rm } from 'fs/promises';

/**
 * Rotuje `file` do `file.1` (zastępując poprzednią rotację), gdy przekroczy
 * `maxBytes`. Zwraca true, gdy rotacja nastąpiła. W przeciwieństwie do obcięcia
 * do zera zachowuje diagnostykę poprzedniej sesji dla podglądu logów.
 */
export async function rotateLogIfNeeded(file: string, maxBytes: number): Promise<boolean> {
  const s = await stat(file).catch(() => null);
  if (!s || s.size <= maxBytes) return false;
  const rotated = `${file}.1`;
  await rm(rotated, { force: true });
  await rename(file, rotated);
  return true;
}
