import { chmod, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import { userInfo } from 'os';
import { logger } from '../../shared/logger';

// Builds the icacls arguments that drop inherited permissions and grant access
// to the current user only. Exported for unit testing.
export function windowsRestrictAclArgs(filePath: string, user: string): string[] {
  return [filePath, '/inheritance:r', '/grant:r', `${user}:F`];
}

async function restrictWindowsAcl(filePath: string): Promise<void> {
  const user = userInfo().username;
  await new Promise<void>((resolve, reject) => {
    execFile('icacls', windowsRestrictAclArgs(filePath, user), { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Writes a file that must not be readable by other users: 0600 on POSIX, and a
// restrictive ACL (current user only) on Windows. Best-effort on Windows — if
// icacls is unavailable the file is still written, but with default permissions.
export async function writeFileRestricted(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, { mode: 0o600 });
  if (process.platform === 'win32') {
    try {
      await restrictWindowsAcl(filePath);
    } catch (e) {
      logger.warn('permissions', `failed to restrict ACL on ${filePath}`, e);
    }
  } else {
    await chmod(filePath, 0o600);
  }
}
