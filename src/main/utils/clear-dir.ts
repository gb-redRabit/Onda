import { readdir, rm, stat } from 'fs/promises';
import { join } from 'path';

/**
 * Usuwa każdy wpis wewnątrz `dir` (pliki i podkatalogi) i raportuje, ile wpisów
 * usunięto oraz ile bajtów zajmowały pliki zwykłe. Brakujący lub nieczytelny
 * katalog to brak operacji — cache są best-effort.
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
      // best-effort: zablokowane/używane wpisy zostają do następnego czyszczenia
    }
  }
  return { removed, bytesFreed };
}
