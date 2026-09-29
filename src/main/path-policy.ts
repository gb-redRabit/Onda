import { posix, win32 } from 'path';

// Destructive fs IPC handlers (delete / move / copy / mkdir) run with the full
// privileges of the user, and the renderer is the only thing between a
// compromised page and `rm -rf`. Rather than relying on the UI's confirm
// dialog, the main process refuses a small set of paths outright: a volume root
// and anything directly inside one, plus the system directories. None of those
// is a legitimate delete or move target from a media player, and losing one is
// not recoverable.
//
// Every function takes an explicit `platform` so the policy is testable on a
// single host; `path.isAbsolute` follows the host platform and cannot be used
// for that.

export type ProtectedPathReason = 'root' | 'system' | 'invalid';

/** Windows directories whose loss breaks the OS, plus the shell's own homes. */
const WINDOWS_PROTECTED = [
  'windows',
  'windows\\system32',
  'windows\\syswow64',
  'windows\\assembly',
  'windows\\winsxs',
  'program files',
  'program files (x86)',
  'programdata',
  'boot',
  'recovery',
  '$recycle.bin',
  'system volume information',
  'perflogs',
  'config.msi'
];

/**
 * POSIX directories whose loss breaks the OS, plus pseudo-filesystems.
 * Stored without a leading separator so a value can be compared against a run
 * of path segments directly; the root itself is handled by isFilesystemRoot.
 */
const POSIX_PROTECTED = [
  'bin',
  'boot',
  'dev',
  'etc',
  'lib',
  'lib32',
  'lib64',
  'proc',
  'root',
  'run',
  'sbin',
  'srv',
  'sys',
  'usr',
  'var',
  'var/lib',
  'var/run'
];

/** The non-empty path segments, with the volume or root stripped. */
function segmentsOf(target: string, platform: NodeJS.Platform): string[] {
  const normalized = platform === 'win32' ? win32.normalize(target) : posix.normalize(target);
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (platform === 'win32') {
    // Drop the drive (`C:`) or the two UNC components (`server`, `share`).
    if (parts.length && /^[a-z]:$/i.test(parts[0])) return parts.slice(1);
    if (parts.length > 2) return parts.slice(2);
    return parts;
  }
  return parts;
}

function isAbsoluteFor(target: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? win32.isAbsolute(target) : posix.isAbsolute(target);
}

function normalizeFor(target: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? win32.normalize(target).toLowerCase() : posix.normalize(target);
}

/** True when `target` is a volume root: `C:\`, `C:`, `\\server\share`, `/`. */
export function isFilesystemRoot(
  target: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (typeof target !== 'string' || !target) return false;
  if (platform === 'win32') {
    // `C:` is drive-relative — it resolves against the current directory of
    // that drive, so it is not an absolute path, but it still names the root.
    if (/^[a-z]:\\?$/i.test(target)) return true;
    if (!win32.isAbsolute(target)) return false;
    // A UNC share root has no child after the share name.
    return /^\\\\[^\\]+\\[^\\]+\\?$/.test(target);
  }
  if (!posix.isAbsolute(target)) return false;
  return posix.normalize(target) === '/';
}

/**
 * Rejects paths that must never be deleted from, moved over or created
 * directly under. Returns the reason, or null when the path is allowed.
 */
export function protectedPathReason(
  target: unknown,
  platform: NodeJS.Platform = process.platform
): ProtectedPathReason | null {
  if (typeof target !== 'string' || !target || target.includes('\0')) return 'invalid';
  // `C:` names a volume root even though it is drive-relative, so the root
  // check runs before the absolute-path check.
  if (isFilesystemRoot(target, platform)) return 'root';
  if (!isAbsoluteFor(target, platform)) return 'invalid';

  const list = platform === 'win32' ? WINDOWS_PROTECTED : POSIX_PROTECTED;
  const segments = segmentsOf(normalizeFor(target, platform), platform);
  const joiner = platform === 'win32' ? '\\' : '/';

  // Anything sitting directly in a volume root (`C:\Users`, `/home`) takes the
  // whole drive's user data with it, so it is refused alongside the root.
  if (segments.length <= 1) return 'system';

  // A protected entry matches only as a PREFIX: `C:\Program Files\Onda` is
  // refused, while `C:\Users\u\Music` and a user's own `Windows.old` are not.
  for (let end = 0; end < segments.length; end++) {
    if (list.includes(segments.slice(0, end + 1).join(joiner))) return 'system';
  }
  return null;
}

/** Convenience wrapper for the destructive handlers. */
export function isProtectedPath(
  target: unknown,
  platform: NodeJS.Platform = process.platform
): boolean {
  return protectedPathReason(target, platform) !== null;
}

/** The parent of a path, or null when the path has no usable parent. */
export function parentOf(target: string): string | null {
  const idx = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'));
  if (idx <= 0) return null;
  return target.slice(0, idx);
}
