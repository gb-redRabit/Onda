import { shell, app, clipboard, dialog, BrowserWindow } from 'electron';
import { stat, realpath } from 'fs/promises';
import { extname } from 'path';
import { iconSourcePath } from '../../utils/file-icon';
import { spawn } from 'child_process';
import { terminalCandidates, spawnFirstAvailable } from '../../utils/terminal';
import { mainMessages } from '../../i18n-main';
import { logger } from '../../../shared/logger';
import { isSafeAbsolutePath } from '../../utils/validate';

// Handlery powłoki systemowej (Schowek/Eksplorator/otwieranie plików), wyodrębnione
// z `fs-handlers.ts`. Wszystkie działają wyłącznie na bezpiecznych ścieżkach absolutnych.

const MAX_PATH_LENGTH = 4096;
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

/** Jeden odłączony shell naraz, aby kanału nie można było użyć jako pętli spawn. */
let openTerminalInFlight = false;

export async function showItemInFolder(fullPath: unknown): Promise<void> {
  if (!isSafeAbsolutePath(fullPath)) {
    logger.warn('fs', 'showItemInFolder rejected invalid path');
    return;
  }
  try {
    shell.showItemInFolder(fullPath);
  } catch (e) {
    logger.warn('fs', `showItemInFolder failed for ${fullPath}`, e);
  }
}

export async function openTerminal(dirPath: unknown): Promise<void> {
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
}

export async function openWithDefault(
  event: { sender: Electron.WebContents },
  filePath: unknown
): Promise<void> {
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
}

export async function getFileIcon(filePath: unknown): Promise<string | null> {
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
}

export function copyPath(filePath: unknown): void {
  if (typeof filePath !== 'string' || filePath.length > MAX_PATH_LENGTH) return;
  clipboard.writeText(filePath);
}

export function readClipboard(): string {
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
}

export function getAppPath(name: string): string {
  // Udostępniamy tylko konkretne ścieżki systemowe, których renderer naprawdę potrzebuje —
  // nigdy całej powierzchni app.getPath() (userData, temp, crashDumps, ...).
  const validPaths = ['desktop', 'downloads'] as const;
  const match = validPaths.find((validPath) => validPath === name);
  return match ? app.getPath(match) : '';
}
