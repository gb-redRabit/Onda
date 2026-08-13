import { readdir, mkdir, rename } from 'fs/promises';
import { dirname, basename, extname, join } from 'path';

const SUBTITLE_EXTS = new Set(['.srt', '.vtt', '.ass']);

export function isSubtitleFile(name: string): boolean {
  return SUBTITLE_EXTS.has(extname(name).toLowerCase());
}

// yt-dlp writes sidecar subtitles next to the media file as `{base}.{lang}.{ext}`.
export function subtitleBaseOf(mediaPath: string): string {
  return basename(mediaPath, extname(mediaPath));
}

export async function findSiblingSubtitleFiles(mediaPath: string): Promise<string[]> {
  try {
    const dir = dirname(mediaPath);
    const base = subtitleBaseOf(mediaPath);
    const names = await readdir(dir);
    return names
      .filter((n) => n.startsWith(base + '.') && isSubtitleFile(n))
      .map((n) => join(dir, n));
  } catch {
    return [];
  }
}

// Moves sidecar subtitle files into a `Subtitles/` subfolder. Returns how many
// files were moved (0 when none exist or the move fails).
export async function moveSubtitlesToFolder(mediaPath: string): Promise<number> {
  const files = await findSiblingSubtitleFiles(mediaPath);
  if (files.length === 0) return 0;
  const dir = dirname(mediaPath);
  const subDir = join(dir, 'Subtitles');
  await mkdir(subDir, { recursive: true });
  let moved = 0;
  for (const f of files) {
    try {
      await rename(f, join(subDir, basename(f)));
      moved++;
    } catch {
      // keep the file in place on failure
    }
  }
  return moved;
}
