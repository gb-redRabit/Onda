import { access, lstat, statfs } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../../shared/logger';
import { withTimeout } from '../../utils/with-timeout';
import type { FileItem } from '../../../shared/types/explorer';

const execAsync = promisify(execCb);

// Zapytanie o wolne miejsce na odłączonym udziale sieciowym potrafi wisieć,
// a to blokowałoby cały panel nawigacji. 2 s wystarcza lokalnym dyskom.
const VOLUME_TIMEOUT_MS = 2_000;

/** Wolne/zajęte bajty z wyniku `statfs`, odporne na wartości niepoprawne. */
export function volumeUsageFromStatfs(stats: { bsize: number; blocks: number; bavail: number }): {
  total: number;
  free: number;
} {
  const total = stats.blocks * stats.bsize;
  if (!Number.isFinite(total) || total <= 0) return { total: 0, free: 0 };
  const free = stats.bavail * stats.bsize;
  // `bavail` bywa większe od `blocks` na dziwnych systemach plików; pasek
  // zajętości nie może wtedy wyjść ujemny.
  return { total, free: Number.isFinite(free) ? Math.min(Math.max(free, 0), total) : 0 };
}

async function readVolumeUsage(root: string): Promise<{ total: number; free: number }> {
  try {
    return volumeUsageFromStatfs(await withTimeout(statfs(root), VOLUME_TIMEOUT_MS));
  } catch {
    // pusta stacja CD, odłączony dysk sieciowy, brak uprawnień — wpis zostaje bez paska
    return { total: 0, free: 0 };
  }
}

export interface DriveUsage {
  name: string;
  path: string;
  total: number;
  free: number;
}

/**
 * Dyski razem z zajętością. Wykrywanie korzeni robimy skanem liter (bez
 * uruchamiania PowerShella jak w `getDrives`), bo panel nawigacji pyta o to
 * przy każdym montowaniu, a sama `statfs` jest tania.
 */
export async function getDriveUsage(): Promise<DriveUsage[]> {
  if (process.platform !== 'win32') {
    return [{ name: '/', path: '/', ...(await readVolumeUsage('/')) }];
  }
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const roots = await Promise.all(
    letters.map(async (letter) => {
      const root = `${letter}:\\`;
      try {
        await withTimeout(access(root), VOLUME_TIMEOUT_MS);
        return root;
      } catch {
        return null;
      }
    })
  );
  return Promise.all(
    roots
      .filter((root): root is string => root !== null)
      .map(async (root) => ({
        name: root.slice(0, 2),
        path: root,
        ...(await readVolumeUsage(root))
      }))
  );
}

export async function getDrives(): Promise<FileItem[]> {
  const platform = process.platform;
  if (platform === 'win32') {
    const viaPowerShell = await getDrivesViaPowerShell();
    if (viaPowerShell.length > 0) return viaPowerShell;
    // Fallback: PowerShell bywa wolne lub niedostępne pod obciążeniem (CI), a wtedy
    // widok dysków wracał trwale pusty. Wylicz litery dysków bezpośrednio.
    return await getDrivesViaLetterScan();
  }
  if (platform === 'darwin') {
    return [
      {
        name: 'Macintosh HD',
        path: '/',
        isDirectory: true,
        size: 0,
        modifiedAt: Date.now(),
        createdAt: Date.now(),
        extension: '',
        mimeType: undefined
      }
    ];
  }
  // linux
  return [
    {
      name: '/',
      path: '/',
      isDirectory: true,
      size: 0,
      modifiedAt: Date.now(),
      createdAt: Date.now(),
      extension: '',
      mimeType: undefined
    }
  ];
}

interface DriveInfo {
  Name: string;
  Root: string;
  Free: number;
  Used: number;
}

function driveItem(name: string, size: number): FileItem {
  // Ścieżką dysku MUSI być korzeń z separatorem (`C:\`), nie samo `C:`. `C:` to
  // ścieżka względna dysku (bieżący katalog na tym dysku), więc wejście na dysk
  // lądowało w złym miejscu, a breadcrumb pokazywał „C:" zamiast „C:\".
  const isWindowsLetter = /^[A-Z]:$/i.test(name);
  return {
    name,
    path: isWindowsLetter ? `${name}\\` : name,
    isDirectory: true,
    size,
    modifiedAt: Date.now(),
    createdAt: Date.now(),
    extension: '',
    mimeType: undefined
  };
}

async function getDrivesViaPowerShell(): Promise<FileItem[]> {
  try {
    const cmd =
      'powershell.exe -NoProfile -NonInteractive -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Free,Used | ConvertTo-Json -Compress"';
    const { stdout } = await execAsync(cmd, {
      encoding: 'utf-8',
      timeout: 15_000,
      windowsHide: true
    });
    if (!stdout || !stdout.trim()) return [];
    let parsed: DriveInfo[];
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      logger.warn('fs', 'could not parse drive list output');
      return [];
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed
      .filter((d) => d && d.Name)
      .map((d) => driveItem(`${d.Name}:`, (d.Used || 0) + (d.Free || 0)));
  } catch (e) {
    logger.warn('fs', 'getDrives (win32) failed', e);
    return [];
  }
}

async function getDrivesViaLetterScan(): Promise<FileItem[]> {
  const drives: FileItem[] = [];
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    try {
      await access(`${letter}:\\`);
      drives.push(driveItem(`${letter}:`, 0));
    } catch {
      // litera niezamontowana
    }
  }
  return drives;
}

export function getFileItem(fullPath: string, stats: import('fs').Stats, name: string): FileItem {
  return {
    name,
    path: fullPath,
    isDirectory: stats.isDirectory(),
    size: stats.size,
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs,
    extension: extname(name).toLowerCase(),
    mimeType: undefined
  };
}

export function stripDuplicateSuffix(name: string): string | null {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  const base = dot >= 0 ? name.slice(0, dot) : name;
  let m: RegExpExecArray | null;

  // Windows/macOS: " - Copy", " - Kopiuj", " — kopia", " – kopia", " - kopia (2)"
  m = /^(.+?)\s+[-\u2013\u2014]\s+(?:Copy|Kopiuj|kopia)(?:\s*\((\d+)\))?$/i.exec(base);
  if (m) return m[1] + ext;

  // GNOME/KDE: " (copy)", " (copy 2)", " (kopia)", " (kopia 2)"
  m = /^(.+?)\s+\(((?:copy|kopia)(?:\s+\d+)?)\)$/i.exec(base);
  if (m) return m[1] + ext;

  // macOS: " copy", " copy 2"
  m = /^(.+?)\s+(copy)(?:\s+(\d+))?$/i.exec(base);
  if (m) return m[1] + ext;

  // Windows 11 keep-both / konflikt macOS: " (2)", " (3)", " 2", " 3"
  m = /^(.+?)\s+\((\d+)\)$/.exec(base) || /^(.+?)\s+(\d+)$/.exec(base);
  if (m) return m[1] + ext;

  return null;
}

// Wspólna implementacja (utils/hash) — re-eksport zachowuje dotychczasowe importy.
export { hashFile as fileHash } from '../../utils/hash';

export async function uniqueDestPath(dest: string): Promise<string> {
  try {
    await lstat(dest);
  } catch {
    return dest;
  }
  const dir = dirname(dest);
  const ext = extname(dest);
  const base = basename(dest, ext);
  for (let i = 2; i < 10000; i++) {
    const candidate = join(dir, `${base} (${i})${ext}`);
    try {
      await lstat(candidate);
    } catch {
      return candidate;
    }
  }
  return dest;
}
