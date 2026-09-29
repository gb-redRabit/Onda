import { posix, win32 } from 'path';

/** True when candidate is root itself or a descendant, never a prefix sibling. */
export function isPathInside(
  rootPath: string,
  candidatePath: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const path = platform === 'win32' ? win32 : posix;
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);

  if (!relative) return true;
  if (path.isAbsolute(relative)) return false;
  return !relative.split(/[\\/]/).some((part) => part === '..');
}
