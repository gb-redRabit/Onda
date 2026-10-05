import { ipcMain } from 'electron';
import { readdir, stat, mkdir, lstat, unlink, rm } from 'fs/promises';
import { join } from 'path';
import { withTimeout } from '../../utils/with-timeout';
import { mainMessages } from '../../i18n-main';
import { errMsg } from '../../../shared/helpers';
import { logger } from '../../../shared/logger';
import type { FileItem } from '../../../shared/types/explorer';
import { getDrives, getFileItem } from './fs-utils';
import { getFileProperties } from './fs-properties';
import { isSafeAbsolutePath } from '../../utils/validate';
import { readTextFileWithinBounds, TEXT_EXTS, TEXT_MAX_BYTES } from '../../utils/read-text-file';
import { isProtectedPath, parentOf } from '../../path-policy';
import { getStore } from '../cover/cover-cache';
import { findDuplicates, moveItems, copyItems } from './fs-transfer';
import {
  showItemInFolder,
  openTerminal,
  openWithDefault,
  getFileIcon,
  copyPath,
  readClipboard,
  getAppPath
} from './shell-handlers';

// Rejestracja kanałów `fs:*`/`shell:*`. Logika operacji żyje w `fs-transfer.ts`
// (move/copy/duplikaty), `fs-properties.ts` i `shell-handlers.ts`; tutaj zostaje
// wyłącznie walidacja wejścia i podpięcie handlerów.

// Wywołania systemu plików (readdir/stat) na martwym udziale sieciowym lub wyłączonym dysku
// mogą wisieć w nieskończoność; timeout zamienia to w błąd, który UI może pokazać.
const FS_OP_TIMEOUT_MS = 15_000;

// Nieużywane ostrzeżenie, zachowane dla spójności komunikatów i18n w main.
void mainMessages;

/**
 * True, gdy dowolny już istniejący przodek `target` jest ścieżką chronioną.
 * Używane dla celów tworzenia/kopiowania, gdzie `recursive: true` utworzyłoby
 * katalogi pośrednie, których użytkownik nigdy nie wskazał.
 */
async function touchesProtectedAncestor(target: string): Promise<boolean> {
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
        const { shell } = await import('electron');
        await shell.trashItem(filePath);
      }
      return true;
    } catch (e) {
      logger.warn('fs', `delete failed for ${filePath}`, e);
      return false;
    }
  });

  ipcMain.handle('fs:move', async (_event, paths: unknown, destination: unknown) => {
    await moveItems(paths, destination);
  });

  ipcMain.handle('fs:copy', async (_event, paths: unknown, destination: unknown) => {
    await copyItems(paths, destination);
  });

  ipcMain.handle('fs:findDuplicates', async (_event, directory: unknown) => {
    return findDuplicates(directory as string);
  });

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: unknown) => {
    void showItemInFolder(fullPath);
  });

  ipcMain.handle('shell:openTerminal', async (_event, dirPath: unknown) => {
    await openTerminal(dirPath);
  });

  ipcMain.handle('shell:openWithDefault', async (event, filePath: unknown) => {
    await openWithDefault(event, filePath);
  });

  ipcMain.handle('shell:getFileIcon', async (_event, filePath: unknown) => {
    return getFileIcon(filePath);
  });

  ipcMain.handle('fs:copyPath', (_event, filePath: unknown) => {
    copyPath(filePath);
  });

  ipcMain.handle('app:readClipboard', (): Promise<string> => {
    return readClipboard();
  });

  ipcMain.handle('app:getPath', (_event, name: string) => {
    return getAppPath(name);
  });

  // Czyta mały plik tekstowy (używane do wsadowego importu TXT/CSV). Ograniczenia
  // rozszerzeń i rozmiaru są w jednym miejscu współdzielonym z czytnikiem napisów, więc żaden
  // kanał nie może zostać rozszerzony w ogólną prymitywę odczytu plików.
  ipcMain.handle('fs:readTextFile', async (_event, filePath: string): Promise<string | null> => {
    const result = await readTextFileWithinBounds(filePath, TEXT_EXTS, TEXT_MAX_BYTES, 'fs');
    return result.ok ? result.text : null;
  });
}
