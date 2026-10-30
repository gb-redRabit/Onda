import type { Dirent } from 'node:fs';

// Windowsowe wpisy systemowe, których użytkownik nie chce widzieć na co dzień.
// Kropkowe pliki są ukryte na wszystkich platformach.
const SYSTEM_ENTRY_NAMES = new Set(['$RECYCLE.BIN', 'System Volume Information', 'desktop.ini']);

export function visibleEntries<T extends Pick<Dirent, 'name'>>(
  entries: readonly T[],
  showHidden: boolean
): T[] {
  if (showHidden) return [...entries];
  return entries.filter(
    (entry) => !entry.name.startsWith('.') && !SYSTEM_ENTRY_NAMES.has(entry.name)
  );
}
