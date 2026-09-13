import { extname, normalize } from 'path';
import { statSync } from 'fs';
import { AUDIO_EXTS, VIDEO_EXTS } from '../shared/constants';

// Pure media-path helpers extracted from `main/index.ts` (plan 2.8): turn an
// argv list (file associations, drag & drop, CLI) into the normalized media
// files that actually exist on disk.

const MEDIA_EXTS = new Set([...AUDIO_EXTS, ...VIDEO_EXTS]);

export function isMediaFilePath(p: string): boolean {
  if (!p || p.startsWith('-')) return false;
  try {
    if (!MEDIA_EXTS.has(extname(p).toLowerCase())) return false;
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function extractMediaPaths(argv: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of argv) {
    if (!isMediaFilePath(a)) continue;
    const norm = normalize(a);
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}
