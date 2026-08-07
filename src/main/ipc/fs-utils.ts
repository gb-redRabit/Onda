import { lstat } from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { join, extname, basename, dirname } from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../shared/logger';
import type { FileItem } from '../../renderer/src/types/explorer';

const execAsync = promisify(execCb);

export async function getDrives(): Promise<FileItem[]> {
  const platform = process.platform;
  if (platform === 'win32') {
    try {
      const cmd =
        'powershell.exe -NoProfile -NonInteractive -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Free,Used | ConvertTo-Json -Compress"';
      const { stdout } = await execAsync(cmd, {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true
      });
      if (!stdout || !stdout.trim()) return [];
      interface DriveInfo {
        Name: string;
        Root: string;
        Free: number;
        Used: number;
      }
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
        .map((d) => {
          const name: string = d.Name;
          const used: number = d.Used || 0;
          const free: number = d.Free || 0;
          return {
            name: `${name}:`,
            path: `${name}:`,
            isDirectory: true,
            size: used + free,
            modifiedAt: Date.now(),
            createdAt: Date.now(),
            extension: '',
            mimeType: undefined
          };
        });
    } catch (e) {
      logger.warn('fs', 'getDrives (win32) failed', e);
      return [];
    }
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

  // Windows 11 keep-both / macOS conflict: " (2)", " (3)", " 2", " 3"
  m = /^(.+?)\s+\((\d+)\)$/.exec(base) || /^(.+?)\s+(\d+)$/.exec(base);
  if (m) return m[1] + ext;

  return null;
}

export function fileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

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
