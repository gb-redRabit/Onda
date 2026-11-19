import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import type { WindowMode } from '../compact/compact-state';
import { pipManager } from '../pip/pip-manager';
import { audioPipManager } from '../pip/audio-pip-manager';
import { addAllowedRoot } from '../media/media-server';
import { OpenFileForwarder } from '../bootstrap/open-files';
import { shouldCloseToTray, shouldHideShellOnClose } from './close-behavior';
import { hasTray } from './tray';
import { SplashController } from './splash';
import { windowIcon } from './window-icon';

// Stan shella (which window is active, which mode, PiP readiness) żyje poza
// `index.ts`, żeby sekwencja startu nie mieszała się z mutowalnym stanem okien.
export interface ShellState {
  mainWindow: BrowserWindow | null;
  compactWindow: BrowserWindow | null;
  mode: WindowMode;
  /** Uruchomienie z `--hidden` — okno czeka w tray. */
  startHidden: boolean;
  /** Core shell (ukryty proces audio) jest aktywny w tym przebiegu. */
  coreShellEnabled: boolean;
  quitting: boolean;
  pipReady: boolean;
  audioPipReady: boolean;
  /** Sprzątanie przy restarcie trybu; ustawiane po starcie serwera mediów. */
  shutdownCleanup: (() => Promise<void>) | null;
}

export const shell: ShellState = {
  mainWindow: null,
  compactWindow: null,
  mode: 'main',
  startHidden: false,
  coreShellEnabled: false,
  quitting: false,
  pipReady: false,
  audioPipReady: false,
  shutdownCleanup: null
};

export function activeShell(): BrowserWindow | null {
  if (shell.mode === 'compact') {
    if (shell.compactWindow && !shell.compactWindow.isDestroyed()) return shell.compactWindow;
    return shell.mainWindow;
  }
  if (shell.mainWindow && !shell.mainWindow.isDestroyed()) return shell.mainWindow;
  return shell.compactWindow;
}

/** Informuje oba shelle, który z nich jest aktywny (Media Session). */
export function sendShellActivity(): void {
  const send = (win: BrowserWindow | null, active: boolean): void => {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('app:shellActive', active);
  };
  send(shell.mainWindow, shell.mode === 'main');
  send(shell.compactWindow, shell.mode === 'compact');
}

export const splash = new SplashController({
  windowIcon,
  getMainWindow: () => activeShell(),
  isStartHidden: () => shell.startHidden
});

export const openFiles = new OpenFileForwarder(
  () => activeShell(),
  (dir) => void addAllowedRoot(dir, { external: true })
);

/** Wspólna decyzja dla obu shelli: chowamy do tray tylko gdy jest po co. */
export function shouldHideShell(): boolean {
  return shouldHideShellOnClose({
    quitting: shell.quitting,
    trayAvailable: hasTray(),
    closeToTray: shouldCloseToTray()
  });
}

/**
 * Kończy aplikację bez pozostawiania procesu w tle. `quitting` musi być ustawione
 * przed `app.quit()`, żeby handlery `close` nie schowały okien do tray.
 */
export function quitApp(): void {
  if (shell.quitting) return;
  shell.quitting = true;
  app.quit();
}

/**
 * Wywoływane, gdy aktywny shell zostanie naprawdę zniszczony (nie schowany).
 * Ukryte okna PiP nie mogą utrzymywać procesu przy życiu ani blokować
 * `window-all-closed`, dlatego zamykamy je razem z shellem.
 */
export function handleShellClosed(): void {
  if (shell.quitting) return;
  pipManager.destroy();
  audioPipManager.destroy();
  shell.pipReady = false;
  shell.audioPipReady = false;
  if (process.platform !== 'darwin') quitApp();
}
