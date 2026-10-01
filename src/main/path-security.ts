import { posix, win32 } from 'path';

/** True, gdy kandydat jest korzeniem samym w sobie lub jego potomkiem, nigdy rodzeństwem o wspólnym prefiksie. */
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
