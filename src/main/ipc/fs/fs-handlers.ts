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
  realpath
} from 'fs/promises';
import { join, extname, basename } from 'path';
import { iconSourcePath } from '../../utils/file-icon';
import { spawn } from 'child_process';
import { terminalCandidates, spawnFirstAvailable } from '../../utils/terminal';
import { withTimeout } from '../../utils/with-timeout';
import { mainMessages } from '../../i18n-main';
import { errMsg } from '../../../shared/helpers';
import { logger } from '../../../shared/logger';
import type { FileItem } from '../../../shared/types/explorer';
import { getDrives, getFileItem, stripDuplicateSuffix, fileHash, uniqueDestPath } from './fs-utils';
import { getFileProperties } from './fs-properties';
import { isSafeAbsolutePath, isSafeStringArray } from '../../utils/validate';
import { readTextFileWithinBounds, TEXT_EXTS, TEXT_MAX_BYTES } from '../../utils/read-text-file';
import { isProtectedPath, parentOf } from '../../path-policy';
import { getStore } from '../cover/cover-cache';

// `fs:findDuplicates` hash'uje pliki-kandydatów. Przypadek użycia explorera to
// folder mediów, więc te limity są znacznie powyżej normalnej biblioteki i istnieją
// tylko po to, by jedno wywołanie nie wysyciło dysku.
const MAX_DUPLICATE_CANDIDATES = 5000;
const MAX_DUPLICATE_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_PATH_LENGTH = 4096;

// Wywołania systemu plików (readdir/stat) na martwym udziale sieciowym lub wyłączonym dysku
// mogą wisieć w nieskończoność; timeout zamienia to w błąd, który UI może pokazać.
const FS_OP_TIMEOUT_MS = 15_000;

/** Jeden odłączony shell naraz, aby kanału nie można było użyć jako pętli spawn. */
let openTerminalInFlight = false;

/**
 * True, gdy dowolny już istniejący przodek `target` jest ścieżką chronioną.
 * Używane dla celów tworzenia/kopiowania, gdzie `recursive: true` utworzyłoby
 * katalogi pośrednie, których użytkownik nigdy nie wskazał.
 */ async function touchesProtectedAncestor(target: string): Promise<boolean> {
  let current = target;
  // Ograniczone przejście: ścieżka dłuższa niż limit segmentów nie może być legalna.
  for (let depth = 0; depth < 64; depth++) {
    if (isProtectedPath(current)) return true;
    try {
      await stat(current);
      return false; // istnieje i nie jest chroniona — nic powyżej nie ma znaczenia
    } catch {
      const parent = parentOf(current);
      if (!parent) return false;
      current = parent;
    }
  }
  return false;
}

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

  ipcMain.handle('fs:getProperties', async (_event, filePath: unknown) => {
    if (!isSafeAbsolutePath(filePath)) {
      logger.warn('fs', 'getProperties rejected invalid path');
      return null;
    }
    try {
      return await withTimeout(getFileProperties(filePath), FS_OP_TIMEOUT_MS);
    } catch (e) {
      logger.warn('fs', `getProperties failed for ${filePath}`, e);
      return null;
    }
  });

  ipcMain.handle('fs:readdir', async (event, dirPath: unknown): Promise<void> => {
    // Brak ścieżki oznacza widok dysków, a nie nieprawidłową ścieżkę — panel nawigacji
    // explorera i breadcrumb wywołują navigateTo('') w znaczeniu "pokaż dyski". To
    // sprawdzenie musi być przed walidacją, inaczej widok dysków po cichu wraca
    // pusty zamiast je wylistować.
    if (dirPath === '' || dirPath === undefined || dirPath === null || dirPath === '/') {
      event.sender.send('fs:readdir:batch', { done: true, items: await getDrives() });
      return;
    }
    if (!isSafeAbsolutePath(dirPath)) {
      logger.warn('fs', 'readdir rejected invalid path');
      event.sender.send('fs:readdir:batch', { done: true, items: [] });
      return;
    }
    if (/^[A-Z]:$/i.test(dirPath)) {
      event.sender.send('fs:readdir:batch', { done: true, items: await getDrives() });
      return;
    }
    const resolvedPath = dirPath;
    let entries;
    try {
      entries = await withTimeout(readdir(resolvedPath, { withFileTypes: true }), FS_OP_TIMEOUT_MS);
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
          const stats = await withTimeout(stat(fullPath), FS_OP_TIMEOUT_MS);
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
    // `recursive: true` tworzy każdy brakujący segment, więc samo `/etc/x`
    // odtwarza ścieżkę systemową. Odrzucamy, gdy dowolny *istniejący* przodek jest
    // chroniony, nie tylko liść.
    if (await touchesProtectedAncestor(dirPath)) {
      logger.warn('fs', `mkdir rejected under protected path: ${dirPath}`);
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
    if (isProtectedPath(filePath)) {
      logger.warn('fs', `delete rejected protected path: ${filePath}`);
      return false;
    }
    try {
      const explorer = (await getStore()).get('explorer') as
        { permanentDelete?: boolean } | undefined;
      if (explorer?.permanentDelete) {
        // Jawna zgoda: nieodwracalne usunięcie.
        const s = await lstat(filePath);
        if (s.isSymbolicLink()) {
          await unlink(filePath);
        } else if (s.isDirectory()) {
          await rm(filePath, { recursive: true, force: true });
        } else {
          await unlink(filePath);
        }
      } else {
        // Bezpieczne domyślne: Kosz systemowy, więc pomyłka jest odwracalna.
        // Jeśli Kosz jest niedostępny, operacja kończy się niepowodzeniem, zamiast
        // spadać do nieodwracalnego usunięcia.
        await shell.trashItem(filePath);
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
    if (isProtectedPath(destination) || isProtectedPath(parentOf(destination))) {
      logger.warn('fs', `move rejected protected destination: ${destination}`);
      return;
    }
    for (const src of paths) {
      if (!isSafeAbsolutePath(src)) continue;
      // Przenoszenie to usunięcie u źródła: obowiązuje ten sam guard.
      if (isProtectedPath(src)) {
        logger.warn('fs', `move rejected protected source: ${src}`);
        continue;
      }
      try {
        const name = basename(src);
        const dest = await uniqueDestPath(join(destination, name));
        if (src.toLowerCase() === dest.toLowerCase()) {
          continue;
        }
        await rename(src, dest);
      } catch {
        try {
          const name = basename(src);
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
    // Kopiowanie nie może zniszczyć źródła, ale zapis drzewa katalogów nad
    // ścieżką systemową i tak nigdy nie jest legalny.
    if (isProtectedPath(destination) || isProtectedPath(parentOf(destination))) {
      logger.warn('fs', `copy rejected protected destination: ${destination}`);
      return;
    }
    for (const src of paths) {
      if (!isSafeAbsolutePath(src)) continue;
      try {
        const name = basename(src);
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

  ipcMain.handle('fs:findDuplicates', async (_event, directory: unknown) => {
    interface DupGroup {
      original: string;
      duplicates: string[];
    }
    const groups: DupGroup[] = [];
    // To hash'uje każdy plik-kandydata w katalogu, więc jest najdroższym
    // kanałem tutaj. Ograniczamy zarówno liczbę wpisów, jak i czytane bajty, aby
    // pojedyncze wywołanie nie wysyciło dysku.
    if (!isSafeAbsolutePath(directory)) {
      logger.warn('fs', 'findDuplicates rejected invalid path');
      return groups;
    }
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .slice(0, MAX_DUPLICATE_CANDIDATES)
        .map((e) => join(directory, e.name));

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
          // brak oryginału — spodziewane, można wybrać kandydata jako referencję
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
        if (refSize > MAX_DUPLICATE_FILE_BYTES) continue;
        let refHash: string | null = null;
        try {
          refHash = await fileHash(refPath, MAX_DUPLICATE_FILE_BYTES);
        } catch (e) {
          logger.warn('fs', `duplicate reference hash failed for ${refPath}`, e);
          continue;
        }
        if (!refHash) continue;
        const dups: string[] = [];
        for (const c of candidates) {
          if (c.toLowerCase() === refPath.toLowerCase()) continue;
          try {
            const s = await stat(c);
            if (s.size !== refSize) continue;
            if ((await fileHash(c, MAX_DUPLICATE_FILE_BYTES)) === refHash) dups.push(c);
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

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: unknown) => {
    if (!isSafeAbsolutePath(fullPath)) {
      logger.warn('fs', 'showItemInFolder rejected invalid path');
      return;
    }
    try {
      shell.showItemInFolder(fullPath);
    } catch (e) {
      logger.warn('fs', `showItemInFolder failed for ${fullPath}`, e);
    }
  });

  ipcMain.handle('shell:openTerminal', async (_event, dirPath: unknown) => {
    if (!isSafeAbsolutePath(dirPath)) {
      logger.warn('fs', 'openTerminal rejected invalid path');
      return;
    }
    try {
      const info = await stat(dirPath);
      if (!info.isDirectory()) {
        logger.warn('fs', `openTerminal rejected (not a directory): ${dirPath}`);
        return;
      }
      const real = await realpath(dirPath);
      // Każde wywołanie uruchamia odłączony shell, więc nieograniczony handler to
      // bomba procesowa. Zatrzask jest zajmowany tylko na ścieżce spawn, więc odrzucone
      // wywołanie nigdy nie blokuje następnej próby.
      if (openTerminalInFlight) {
        logger.warn('fs', 'openTerminal rejected (one already opening)');
        return;
      }
      openTerminalInFlight = true;
      // Windows → cmd, macOS → Terminal, Linux → pierwszy dostępny emulator.
      const launched = await spawnFirstAvailable(
        terminalCandidates(process.platform, real),
        (cmd, args, opts) => spawn(cmd, args, opts)
      );
      if (!launched) {
        logger.warn('fs', `openTerminal: no terminal emulator available for ${real}`);
      }
    } catch (e) {
      logger.warn('fs', `openTerminal failed for ${dirPath}`, e);
    } finally {
      // Dziecko jest odłączone i unref'owane, więc nie ma na co czekać; zatrzask
      // musi pokryć tylko sam spawn.
      setTimeout(() => {
        openTerminalInFlight = false;
      }, 500);
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
      // Pliki wykonywalne mogą uruchomić dowolny kod — wymagamy wyraźnego potwierdzenia.
      if (EXECUTABLE_EXTS.has(ext)) {
        const win = BrowserWindow.fromWebContents(event.sender);
        const m = mainMessages();
        const options: Electron.MessageBoxOptions = {
          type: 'warning',
          buttons: [m.openExecCancel, m.openExecOpen],
          defaultId: 0,
          cancelId: 0,
          title: m.openExecTitle,
          message: m.openExecMessage(filePath),
          detail: m.openExecDetail
        };
        const { response } = win
          ? await dialog.showMessageBox(win, options)
          : await dialog.showMessageBox(options);
        if (response !== 1) return;
      }
      const real = await realpath(filePath);
      await shell.openPath(real);
    } catch (e) {
      logger.warn('fs', `openWithDefault failed for ${filePath}`, e);
    }
  });

  ipcMain.handle('shell:getFileIcon', async (_event, filePath: unknown) => {
    // Bez sprawdzenia kształtu to wyrocznia istnienia plus pompa base64 dla
    // dowolnej ścieżki podanej przez renderer. Celowo nie ma limitu współbieżności:
    // listing folderu prosi o setki ikon naraz, a ich odrzucanie
    // byłoby widoczną regresją.
    if (!isSafeAbsolutePath(filePath)) {
      logger.warn('fs', 'getFileIcon rejected invalid path');
      return null;
    }
    try {
      const icon = await app.getFileIcon(iconSourcePath(filePath), { size: 'large' });
      if (icon.isEmpty()) return null;
      return icon.toDataURL();
    } catch (e) {
      logger.warn('fs', `getFileIcon failed for ${filePath}`, e);
      return null;
    }
  });

  ipcMain.handle('fs:copyPath', (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.length > MAX_PATH_LENGTH) return;
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
    // Udostępniamy tylko konkretne ścieżki systemowe, których renderer naprawdę potrzebuje —
    // nigdy całej powierzchni app.getPath() (userData, temp, crashDumps, ...).
    const validPaths = ['desktop', 'downloads'] as const;
    const match = validPaths.find((validPath) => validPath === name);
    return match ? app.getPath(match) : '';
  });

  // Czyta mały plik tekstowy (używane do wsadowego importu TXT/CSV). Ograniczenia
  // rozszerzeń i rozmiaru są w jednym miejscu współdzielonym z czytnikiem napisów, więc żaden
  // kanał nie może zostać rozszerzony w ogólną prymitywę odczytu plików.
  ipcMain.handle('fs:readTextFile', async (_event, filePath: string): Promise<string | null> => {
    const result = await readTextFileWithinBounds(filePath, TEXT_EXTS, TEXT_MAX_BYTES, 'fs');
    return result.ok ? result.text : null;
  });
}
