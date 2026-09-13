import { createHash } from 'crypto';
import { statSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { AUDIO_EXTS, VIDEO_EXTS } from '../../shared/constants';

// Pure helpers extracted from `cover-cache.ts` (plan 2.8) — no cache state.

export function evictCache(map: Map<string, unknown>, maxSize: number): void {
  if (map.size <= maxSize) return;
  const toDelete = map.size - maxSize;
  let i = 0;
  for (const key of map.keys()) {
    if (i >= toDelete) break;
    map.delete(key);
    i++;
  }
}

export function hashPath(filePath: string): string {
  return createHash('md5').update(filePath.toLowerCase()).digest('hex');
}

export function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
