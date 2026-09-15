import { readdir, rm, stat } from 'fs/promises';
import { join } from 'path';

/**
 * Removes every entry inside `dir` (files and subdirectories) and reports how
 * many entries were removed and how many bytes of regular files they held.
 * A missing or unreadable directory is a no-op — the caches are best-effort.
 */
export async function clearDirContents(dir: string): Promise<{
  removed: number;
  bytesFreed: number;
}> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  let removed = 0;
  let bytesFreed = 0;
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full).catch(() => null);
    if (s?.isFile()) bytesFreed += s.size;
    try {
      await rm(full, { recursive: true, force: true });
      removed++;
    } catch {
      // best-effort: locked/in-use entries stay until the next clear
    }
  }
  return { removed, bytesFreed };
}
