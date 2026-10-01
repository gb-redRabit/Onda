import { chmod, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import { userInfo } from 'os';
import { logger } from '../../shared/logger';

// Buduje argumenty icacls, które odbierają uprawnienia dziedziczone i przyznają
// dostęp tylko bieżącemu użytkownikowi. Eksportowane do testów jednostkowych.
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

// Zapisuje plik, który nie może być czytelny dla innych użytkowników: 0600 na POSIX
// i restrykcyjny ACL (tylko bieżący użytkownik) na Windows. Best-effort na Windows —
// jeśli icacls jest niedostępny, plik i tak zostanie zapisany, ale z domyślnymi uprawnieniami.
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
