import { shell } from 'electron';
import { existsSync } from 'fs';
import { extname } from 'path';

/** Injectable edges so the resolution logic can be unit-tested without mocks. */
export interface IconSourceDeps {
  platform?: NodeJS.Platform;
  readShortcutLink?: (shortcutPath: string) => { icon?: string; target?: string };
  exists?: (path: string) => boolean;
}

/**
 * Path whose icon should be used for `filePath`.
 *
 * Windows resolves a `.lnk` to the generic shortcut icon, so every desktop
 * shortcut would look identical. We use the shortcut's own icon (when set and
 * present) or its target — an `.exe` carries the real application icon. Any
 * other path is returned unchanged.
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
    // unreadable/invalid shortcut — fall back to the shortcut itself
  }
  return filePath;
}

/** Windows stores the shortcut icon as `path,index` or `"path",index`. */
function parseIconField(icon: string): string {
  const value = icon.trim();
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1);
    if (end > 0) return value.slice(1, end);
  }
  return value.replace(/,\s*-?\d+$/, '');
}
