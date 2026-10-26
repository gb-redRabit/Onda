import { readdir } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';

const SIDECAR_EXTS = ['.lrc', '.srt'];

/**
 * Szuka sidecara `<base>.lrc`/`<base>.srt` (lub `<base>.<wariant>.<ext>`) obok
 * pliku audio. Preferuje LRC, potem dokładną nazwę i najkrótszą pasującą.
 */
export async function findLyricsSidecar(mediaPath: string): Promise<string | null> {
  try {
    const dir = dirname(mediaPath);
    const base = basename(mediaPath, extname(mediaPath)).toLowerCase();
    const names = await readdir(dir);
    const matches = names
      .filter((name) => {
        const lower = name.toLowerCase();
        return SIDECAR_EXTS.some(
          (ext) =>
            lower === `${base}${ext}` || (lower.startsWith(`${base}.`) && lower.endsWith(ext))
        );
      })
      .sort((a, b) => {
        const extA = extname(a).toLowerCase();
        const extB = extname(b).toLowerCase();
        const priority = (ext: string): number => (ext === '.lrc' ? 0 : 1);
        return priority(extA) - priority(extB) || a.length - b.length;
      });
    return matches.length ? join(dir, matches[0]) : null;
  } catch {
    return null;
  }
}
