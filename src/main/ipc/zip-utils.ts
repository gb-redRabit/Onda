import { readdir, stat } from 'fs/promises';
import { join } from 'path';

// Rekursywnie znajduje pierwszy plik o podanej nazwie w katalogu.
export async function findFile(dir: string, name: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(full, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      const s = await stat(full).catch(() => null);
      if (s && s.isFile()) return full;
    }
  }
  return null;
}
