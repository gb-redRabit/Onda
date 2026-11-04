import { createHash } from 'crypto';
import { statSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { AUDIO_EXTS, VIDEO_EXTS } from '../../../shared/constants';

// Czyste helpery wyodrębnione z `cover-cache.ts` (plan 2.8) — bez stanu cache.

export { uniqueId } from '../../utils/ids';

/**
 * Usuwa najstarsze wpisy (kolejność wstawienia) aż do spełnienia limitu wpisów
 * i opcjonalnego limitu bajtów. `sizeOf` jest wymagane tylko dla drugiego limitu.
 */
export function evictCache<T>(
  map: Map<string, T>,
  maxSize: number,
  maxBytes?: number,
  sizeOf?: (value: T) => number
): void {
  if (map.size > maxSize) {
    const toDelete = map.size - maxSize;
    let i = 0;
    for (const key of map.keys()) {
      if (i >= toDelete) break;
      map.delete(key);
      i++;
    }
  }
  if (!maxBytes || !sizeOf) return;
  let total = 0;
  for (const value of map.values()) total += sizeOf(value);
  for (const [key, value] of map) {
    if (total <= maxBytes) break;
    map.delete(key);
    total -= sizeOf(value);
  }
}

export function hashPath(filePath: string): string {
  return createHash('md5').update(filePath.toLowerCase()).digest('hex');
}

export function isEnoent(e: unknown): boolean {
  return Boolean(
    e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'ENOENT'
  );
}

export function findSiblingVideo(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  if (!AUDIO_EXTS.includes(ext)) return null;
  const dir = dirname(filePath);
  const name = basename(filePath, ext);
  for (const vExt of VIDEO_EXTS) {
    const videoPath = join(dir, name + vExt);
    const stats = statSync(videoPath, { throwIfNoEntry: false });
    if (stats) return videoPath;
  }
  return null;
}
