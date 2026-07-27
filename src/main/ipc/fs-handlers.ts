import { ipcMain, shell, app, clipboard, BrowserWindow } from 'electron';
import { readdir, stat, lstat, readFile, writeFile, mkdir, rename, unlink, rm } from 'fs/promises';
import { join, extname } from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import type { FileItem } from '../../renderer/src/types/explorer';

const execAsync = promisify(execCb);

async function getWindowsDrives(): Promise<FileItem[]> {
  const fallback = [
    {
      name: 'C:',
      path: 'C:',
      isDirectory: true,
      size: 0,
      modifiedAt: Date.now(),
      createdAt: Date.now(),
      extension: '',
      mimeType: undefined
    }
  ];
  try {
    const cmd =
      'powershell.exe -NoProfile -NonInteractive -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Free,Used | ConvertTo-Json -Compress"';
    const { stdout } = await execAsync(cmd, {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true
    });
    if (!stdout || !stdout.trim()) return fallback;
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
      return fallback;
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
    return fallback;
  }
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

export function registerFsHandlers(): void {
  ipcMain.handle('fs:getDrives', async (): Promise<FileItem[]> => {
    return getWindowsDrives();
  });

  ipcMain.handle('fs:readdir', async (event, dirPath: string): Promise<void> => {
    if (!dirPath || dirPath === '/') {
      event.sender.send('fs:readdir:batch', { done: true, items: await getWindowsDrives() });
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

  ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });

  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false;
  });

  ipcMain.handle('window:setAlwaysOnTop', (_event, flag: boolean) => {
    BrowserWindow.getFocusedWindow()?.setAlwaysOnTop(flag);
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
        execCb(`start cmd /K "cd /d "${dirPath}""`, { windowsHide: true });
      } else {
        execCb(`open -a Terminal "${dirPath}"`);
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
    return app.getPath(
      validPaths.includes(name as any) ? (name as Parameters<typeof app.getPath>[0]) : 'userData'
    );
  });

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });
}
