import { shell } from 'electron';
import { existsSync } from 'fs';
import { extname } from 'path';

/** Wstrzykiwalne krawędzie, aby logikę rozwiązywania można było testować jednostkowo bez mocków. */
export interface IconSourceDeps {
  platform?: NodeJS.Platform;
  readShortcutLink?: (shortcutPath: string) => { icon?: string; target?: string };
  exists?: (path: string) => boolean;
}

/**
 * Ścieżka, której ikona powinna zostać użyta dla `filePath`.
 *
 * Windows rozwiązuje `.lnk` do ogólnej ikony skrótu, więc każdy skrót na pulpicie
 * wyglądałby identycznie. Używamy ikony własnej skrótu (gdy ustawiona i obecna)
 * albo jego celu — `.exe` niesie prawdziwą ikonę aplikacji. Każda inna ścieżka
 * jest zwracana bez zmian.
 */
export function iconSourcePath(filePath: string, deps: IconSourceDeps = {}): string {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'win32' || extname(filePath).toLowerCase() !== '.lnk') {
    return filePath;
  }
  const readShortcutLink = deps.readShortcutLink ?? ((p: string) => shell.readShortcutLink(p));
  const exists = deps.exists ?? existsSync;
  try {
    const link = readShortcutLink(filePath);
    const iconPath = parseIconField(link.icon || '');
    if (iconPath && exists(iconPath)) return iconPath;
    if (link.target && exists(link.target)) return link.target;
  } catch {
    // nieczytelny/nieprawidłowy skrót — wróć do samego skrótu
  }
  return filePath;
}

/** Windows przechowuje ikonę skrótu jako `path,index` lub `"path",index`. */
function parseIconField(icon: string): string {
  const value = icon.trim();
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1);
    if (end > 0) return value.slice(1, end);
  }
  return value.replace(/,\s*-?\d+$/, '');
}
