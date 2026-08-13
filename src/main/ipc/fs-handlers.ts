import { ipcMain, shell, app, clipboard, dialog, BrowserWindow } from 'electron';
import {
  readdir,
  stat,
  lstat,
  mkdir,
  rename,
  unlink,
  rm,
  copyFile,
  cp,
  realpath,
  readFile
} from 'fs/promises';
import { join, extname, basename } from 'path';
import { spawn } from 'child_process';
import { errMsg } from '../../shared/helpers';
import { logger } from '../../shared/logger';
import type { FileItem } from '../../renderer/src/types/explorer';
import { getDrives, getFileItem, stripDuplicateSuffix, fileHash, uniqueDestPath } from './fs-utils';
import { isSafeAbsolutePath, isSafeStringArray } from '../utils/validate';

const EXECUTABLE_EXTS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.ps1',
  '.msi',
  '.vbs',
  '.js',
  '.jar',
  '.scr',
  '.reg'
]);

export function registerFsHandlers(): void {
  ipcMain.handle('fs:getDrives', async (): Promise<FileItem[]> => {
    return getDrives();
  });

  ipcMain.handle('fs:getProperties', async (_event, filePath: string) => {
    let s;
    try {
      s = await stat(filePath);
    } catch (e) {
      logger.warn('fs', `getProperties stat failed for ${filePath}`, e);
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
      } catch (e) {
        logger.warn('fs', `getProperties walk failed for ${dir}`, e);
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
          } catch (err) {
            logger.warn('fs', `getProperties stat failed for ${join(dir, e.name)}`, err);
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
    let entries;
    try {
      entries = await readdir(resolvedPath, { withFileTypes: true });
    } catch (err) {
      event.sender.send('fs:readdir:batch', {
        done: true,
        items: [],
        error: errMsg(err)
      });
      return;
    }
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

  ipcMain.handle('fs:mkdir', async (_event, dirPath: unknown) => {
    if (!isSafeAbsolutePath(dirPath)) {
      logger.warn('fs', 'mkdir rejected invalid path');
      return false;
    }
    try {
      await mkdir(dirPath, { recursive: true });
      return true;
    } catch (e) {
      logger.warn('fs', `mkdir failed for ${dirPath}`, e);
      return false;
    }
  });

  ipcMain.handle('fs:delete', async (_event, filePath: unknown) => {
    if (!isSafeAbsolutePath(filePath)) {
      logger.warn('fs', 'delete rejected invalid path');
      return false;
    }
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
    } catch (e) {
      logger.warn('fs', `delete failed for ${filePath}`, e);
      return false;
    }
  });

  ipcMain.handle('fs:move', async (_event, paths: unknown, destination: unknown) => {
    if (!isSafeStringArray(paths) || !isSafeAbsolutePath(destination)) {
      logger.warn('fs', 'move rejected invalid arguments');
      return;
    }
    for (const src of paths) {
      if (!isSafeAbsolutePath(src)) continue;
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
          logger.error('fs', `fs:move failed for ${src}`, err2);
        }
      }
    }
  });

  ipcMain.handle('fs:copy', async (_event, paths: unknown, destination: unknown) => {
    if (!isSafeStringArray(paths) || !isSafeAbsolutePath(destination)) {
      logger.warn('fs', 'copy rejected invalid arguments');
      return;
    }
    for (const src of paths) {
      if (!isSafeAbsolutePath(src)) continue;
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
        logger.error('fs', `fs:copy failed for ${src}`, err);
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
          // original missing — expected, may pick candidate as reference
        }
        if (!refStats?.isFile()) {
          if (candidates.length < 2) continue;
          refPath = candidates[0];
          try {
            refStats = await stat(refPath);
          } catch (e) {
            logger.warn('fs', `duplicate reference stat failed for ${refPath}`, e);
            continue;
          }
        }
        const refSize = refStats.size;
        let refHash = '';
        try {
          refHash = await fileHash(refPath);
        } catch (e) {
          logger.warn('fs', `duplicate reference hash failed for ${refPath}`, e);
          continue;
        }
        const dups: string[] = [];
        for (const c of candidates) {
          if (c.toLowerCase() === refPath.toLowerCase()) continue;
          try {
            const s = await stat(c);
            if (s.size !== refSize) continue;
            if ((await fileHash(c)) === refHash) dups.push(c);
          } catch (e) {
            logger.warn('fs', `duplicate compare failed for ${c}`, e);
          }
        }
        if (dups.length > 0) groups.push({ original: refPath, duplicates: dups });
      }
    } catch (e) {
      logger.warn('fs', `findDuplicates failed for ${directory}`, e);
    }
    return groups;
  });

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    try {
      shell.showItemInFolder(fullPath);
    } catch (e) {
      logger.warn('fs', `showItemInFolder failed for ${fullPath}`, e);
    }
  });

  ipcMain.handle('shell:openTerminal', async (_event, dirPath: string) => {
    try {
      const info = await stat(dirPath);
      if (!info.isDirectory()) {
        logger.warn('fs', `openTerminal rejected (not a directory): ${dirPath}`);
        return;
      }
      const real = await realpath(dirPath);
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        spawn('cmd', ['/K', 'cd', '/d', real], { windowsHide: true, detached: true }).unref();
      } else {
        spawn('open', ['-a', 'Terminal', real], { detached: true }).unref();
      }
    } catch (e) {
      logger.warn('fs', `openTerminal failed for ${dirPath}`, e);
    }
  });

  ipcMain.handle('shell:openWithDefault', async (event, filePath: unknown) => {
    if (!isSafeAbsolutePath(filePath)) {
      logger.warn('fs', 'openWithDefault rejected invalid path');
      return;
    }
    try {
      const ext = extname(filePath).toLowerCase();
      if (ext === '.lnk' || ext === '.url') {
        logger.warn('fs', `openWithDefault blocked (shortcut file): ${filePath}`);
        return;
      }
      // Executable files can run arbitrary code — require explicit confirmation.
      if (EXECUTABLE_EXTS.has(ext)) {
        const win = BrowserWindow.fromWebContents(event.sender);
        const { response } = win
          ? await dialog.showMessageBox(win, {
              type: 'warning',
              buttons: ['Anuluj', 'Otwórz'],
              defaultId: 0,
              cancelId: 0,
              title: 'Otwieranie pliku wykonywalnego',
              message: `Czy na pewno chcesz otworzyć plik wykonywalny?\n${filePath}`,
              detail: 'Uruchamianie nieznanych plików wykonywalnych może być niebezpieczne.'
            })
          : await dialog.showMessageBox({
              type: 'warning',
              buttons: ['Anuluj', 'Otwórz'],
              defaultId: 0,
              cancelId: 0,
              title: 'Otwieranie pliku wykonywalnego',
              message: `Czy na pewno chcesz otworzyć plik wykonywalny?\n${filePath}`,
              detail: 'Uruchamianie nieznanych plików wykonywalnych może być niebezpieczne.'
            });
        if (response !== 1) return;
      }
      const real = await realpath(filePath);
      await shell.openPath(real);
    } catch (e) {
      logger.warn('fs', `openWithDefault failed for ${filePath}`, e);
    }
  });

  ipcMain.handle('shell:getFileIcon', async (_event, filePath: string) => {
    try {
      const icon = await app.getFileIcon(filePath, { size: 'small' });
      return icon.toDataURL();
    } catch (e) {
      logger.warn('fs', `getFileIcon failed for ${filePath}`, e);
      return null;
    }
  });

  ipcMain.handle('fs:copyPath', (_event, filePath: string) => {
    clipboard.writeText(filePath);
  });

  ipcMain.handle('app:readClipboard', (): string => {
    try {
      return clipboard.readText();
    } catch {
      return '';
    }
  });

  ipcMain.handle('app:getPath', (_event, name: string) => {
    // Only expose the specific system paths the renderer actually needs —
    // never the full app.getPath() surface (userData, temp, crashDumps, ...).
    const validPaths = ['desktop', 'downloads'] as const;
    const match = validPaths.find((validPath) => validPath === name);
    return match ? app.getPath(match) : '';
  });

  // Reads a small text file (used for TXT/CSV batch import). Capped in size and
  // limited to .txt/.csv/.tsv extensions so it can't slurp arbitrary files.
  ipcMain.handle('fs:readTextFile', async (_event, filePath: string): Promise<string | null> => {
    if (typeof filePath !== 'string' || !filePath) return null;
    if (!/\.(txt|csv|tsv)$/i.test(filePath)) return null;
    try {
      if (!(await isSafeAbsolutePath(filePath))) return null;
      const info = await stat(filePath);
      if (info.size > 5 * 1024 * 1024) return null;
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  });
}
