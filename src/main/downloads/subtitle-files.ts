import { readdir, mkdir, rename } from 'fs/promises';
import { dirname, basename, extname, join } from 'path';

const SUBTITLE_EXTS = new Set(['.srt', '.vtt', '.ass']);

export function isSubtitleFile(name: string): boolean {
  return SUBTITLE_EXTS.has(extname(name).toLowerCase());
}

// yt-dlp zapisuje napisy sidecar obok pliku mediów jako `{base}.{lang}.{ext}`.
function subtitleBaseOf(mediaPath: string): string {
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

// Przenosi pliki napisów sidecar do podfolderu `Subtitles/`. Zwraca liczbę
// przeniesionych plików (0, gdy żadne nie istnieją lub przenoszenie się nie powiedzie).
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
      // przy niepowodzeniu pozostaw plik na miejscu
    }
  }
  return moved;
}
