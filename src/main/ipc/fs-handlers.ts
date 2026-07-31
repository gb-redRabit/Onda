import { ipcMain, shell, app, clipboard, BrowserWindow } from 'electron';
import {
  readdir,
  stat,
  lstat,
  readFile,
  writeFile,
  mkdir,
  rename,
  unlink,
  rm,
  copyFile,
  cp
} from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { join, extname, basename } from 'path';
import { exec as execCb, spawn } from 'child_process';
import { promisify } from 'util';
import type { FileItem } from '../../renderer/src/types/explorer';

const execAsync = promisify(execCb);

async function getDrives(): Promise<FileItem[]> {
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
    } catch {
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

function getFileItem(fullPath: string, stats: import('fs').Stats, name: string): FileItem {
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

function stripDuplicateSuffix(name: string): string | null {
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

function fileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function uniqueDestPath(dest: string): Promise<string> {
  try {
    await lstat(dest);
  } catch {
    return dest;
  }
  const dir =
    dest.substring(0, dest.lastIndexOf('\\')) || dest.substring(0, dest.lastIndexOf('/')) || '';
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

export function registerFsHandlers(): void {
  ipcMain.handle('fs:getDrives', async (): Promise<FileItem[]> => {
    return getDrives();
  });

  ipcMain.handle('fs:getProperties', async (_event, filePath: string) => {
    let s;
    try {
      s = await stat(filePath);
    } catch {
      return null;
    }
    const base = {
      name: basename(filePath),
      path: filePath,
      isDirectory: s.isDirectory(),
      size: s.size,
      createdAt: s.birthtimeMs,
      modifiedAt: s.mtimeMs
    };
    if (!s.isDirectory()) return base;
    let itemCount = 0;
    let dirCount = 0;
    let fileCount = 0;
    let totalSize = 0;
    let processed = 0;
    const MAX = 100000;
    async function walk(dir: string) {
      if (processed >= MAX) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (processed >= MAX) return;
        processed++;
        if (e.isDirectory()) {
          dirCount++;
          itemCount++;
          await walk(join(dir, e.name));
        } else if (e.isFile()) {
          fileCount++;
          itemCount++;
          try {
            const st = await stat(join(dir, e.name));
            totalSize += st.size;
          } catch {
            /* skip */
          }
        }
      }
    }
    await walk(filePath);
    return {
      ...base,
      itemCount,
      dirCount,
      fileCount,
      totalSize,
      truncated: processed >= MAX
    };
  });

  ipcMain.handle('fs:readdir', async (event, dirPath: string): Promise<void> => {
    if (!dirPath || dirPath === '/') {
      event.sender.send('fs:readdir:batch', { done: true, items: await getDrives() });
      return;
    }
    const resolvedPath = /^[A-Z]:$/i.test(dirPath) ? `${dirPath}\\` : dirPath;
    const entries = await readdir(resolvedPath, { withFileTypes: true });
    const filtered = entries.filter((entry) => !entry.name.startsWith('.'));
    const BATCH = 200;
    for (let i = 0; i < filtered.length; i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          const fullPath = join(resolvedPath, entry.name);
          const stats = await stat(fullPath);
          return getFileItem(fullPath, stats, entry.name);
        })
      );
      const items: FileItem[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') items.push(r.value);
      }
      event.sender.send('fs:readdir:batch', { done: false, items });
    }
    event.sender.send('fs:readdir:batch', { done: true, items: [] });
  });

  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    try {
      const s = await stat(filePath);
      return {
        size: s.size,
        modifiedAt: s.mtimeMs,
        createdAt: s.birthtimeMs,
        isDirectory: s.isDirectory()
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const buf = await readFile(filePath);
      return buf.toString('base64');
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    try {
      await writeFile(filePath, Buffer.from(content, 'base64'));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
    try {
      await mkdir(dirPath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      await rename(oldPath, newPath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:delete', async (_event, filePath: string) => {
    try {
      const s = await lstat(filePath);
      if (s.isSymbolicLink()) {
        await unlink(filePath);
      } else if (s.isDirectory()) {
        await rm(filePath, { recursive: true, force: true });
      } else {
        await unlink(filePath);
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:move', async (_event, paths: string[], destination: string) => {
    for (const src of paths) {
      try {
        const name = src.split('\\').pop() || src.split('/').pop() || '';
        const dest = await uniqueDestPath(join(destination, name));
        if (src.toLowerCase() === dest.toLowerCase()) {
          continue;
        }
        await rename(src, dest);
      } catch {
        try {
          const name = src.split('\\').pop() || src.split('/').pop() || '';
          const dest = await uniqueDestPath(join(destination, name));
          const s = await lstat(src);
          if (s.isDirectory()) {
            await cp(src, dest, { recursive: true });
            await rm(src, { recursive: true, force: true });
          } else {
            await copyFile(src, dest);
            await unlink(src);
          }
        } catch (err2) {
          console.error('[fs:move] failed for', src, err2);
        }
      }
    }
  });

  ipcMain.handle('fs:copy', async (_event, paths: string[], destination: string) => {
    for (const src of paths) {
      try {
        const name = src.split('\\').pop() || src.split('/').pop() || '';
        const dest = await uniqueDestPath(join(destination, name));
        const s = await lstat(src);
        if (s.isDirectory()) {
          await cp(src, dest, { recursive: true });
        } else {
          await copyFile(src, dest);
        }
      } catch (err) {
        console.error('[fs:copy] failed for', src, err);
      }
    }
  });

  ipcMain.handle('fs:findDuplicates', async (_event, directory: string) => {
    interface DupGroup {
      original: string;
      duplicates: string[];
    }
    const groups: DupGroup[] = [];
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const files = entries.filter((e) => e.isFile()).map((e) => join(directory, e.name));

      const bucket = new Map<string, string[]>();
      for (const f of files) {
        const stripped = stripDuplicateSuffix(basename(f));
        if (stripped) {
          if (!bucket.has(stripped)) bucket.set(stripped, []);
          bucket.get(stripped)!.push(f);
        }
      }

      for (const [origName, candidates] of bucket) {
        const originalPath = join(directory, origName);
        let refPath = originalPath;
        let refStats: Awaited<ReturnType<typeof stat>> | null = null;
        try {
          refStats = await stat(originalPath);
        } catch {
          /* original missing */
        }
        if (!refStats?.isFile()) {
          if (candidates.length < 2) continue;
          refPath = candidates[0];
          try {
            refStats = await stat(refPath);
          } catch {
            continue;
          }
        }
        const refSize = refStats.size;
        let refHash = '';
        try {
          refHash = await fileHash(refPath);
        } catch {
          continue;
        }
        const dups: string[] = [];
        for (const c of candidates) {
          if (c.toLowerCase() === refPath.toLowerCase()) continue;
          try {
            const s = await stat(c);
            if (s.size !== refSize) continue;
            if ((await fileHash(c)) === refHash) dups.push(c);
          } catch {
            /* skip unreadable */
          }
        }
        if (dups.length > 0) groups.push({ original: refPath, duplicates: dups });
      }
    } catch {
      /* empty/unreadable dir */
    }
    return groups;
  });

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle('window:setAlwaysOnTop', (event, flag: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setAlwaysOnTop(flag);
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      const allowedProtocols = ['https:', 'http:', 'mailto:'];
      try {
        const parsed = new URL(url);
        if (!allowedProtocols.includes(parsed.protocol)) return;
      } catch {
        return;
      }
      await shell.openExternal(url);
    } catch {
      // ignore
    }
  });

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    try {
      shell.showItemInFolder(fullPath);
    } catch {
      // ignore
    }
  });

  ipcMain.handle('shell:openTerminal', async (_event, dirPath: string) => {
    try {
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        spawn('cmd', ['/K', 'cd', '/d', dirPath], { windowsHide: true, detached: true }).unref();
      } else {
        spawn('open', ['-a', 'Terminal', dirPath], { detached: true }).unref();
      }
    } catch {
      // ignore
    }
  });

  ipcMain.handle('shell:openWithDefault', async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
    } catch {
      // ignore
    }
  });

  ipcMain.handle('shell:getFileIcon', async (_event, filePath: string) => {
    try {
      const icon = await app.getFileIcon(filePath, { size: 'small' });
      return icon.toDataURL();
    } catch {
      return null;
    }
  });

  ipcMain.handle('fs:copyPath', (_event, filePath: string) => {
    clipboard.writeText(filePath);
  });

  ipcMain.handle('app:getPath', (_event, name: string) => {
    const validPaths: Array<Parameters<typeof app.getPath>[0]> = [
      'home',
      'userData',
      'temp',
      'desktop',
      'documents',
      'downloads',
      'music',
      'pictures',
      'videos',
      'recent',
      'logs',
      'crashDumps'
    ];
    const pathName = validPaths.find((validPath) => validPath === name) ?? 'userData';
    return app.getPath(pathName);
  });

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });
}
