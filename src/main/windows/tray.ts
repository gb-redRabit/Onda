import { app, Menu, Tray, type BrowserWindow } from 'electron';
import { trayIcon } from './window-icon';
import { mainMessages } from '../i18n-main';

// Ikona tray + menu kontekstowe wyodrębnione z `main/index.ts` (plan 2.8).
// Etykiety są lokalizowane przez mainMessages() i odświeżane, gdy zmieni się
// język w ustawieniach (bez restartu).

let tray: Tray | null = null;
let getShellWindowRef: (() => BrowserWindow | null) | null = null;
let modeOptions: TrayModeOptions | null = null;

export function hasTray(): boolean {
  return tray !== null;
}

export function destroyTray(): void {
  try {
    if (tray && !tray.isDestroyed()) tray.destroy();
  } catch {
    /* już zniszczone */
  }
  tray = null;
  getShellWindowRef = null;
  modeOptions = null;
}

export interface TrayModeOptions {
  /** Czy w tym trybie można przełączyć okno w trakcie działania. */
  canToggleMode: () => boolean;
  toggleMode: () => void;
}

function withShell(fn: (win: BrowserWindow) => void): () => void {
  return () => {
    const shell = getShellWindowRef?.();
    if (shell && !shell.isDestroyed()) fn(shell);
  };
}

function showShell(): void {
  const shell = getShellWindowRef?.();
  if (!shell || shell.isDestroyed()) return;
  if (shell.isMinimized()) shell.restore();
  shell.show();
  shell.focus();
}

function buildMenu(): Menu {
  const msg = mainMessages();
  return Menu.buildFromTemplate([
    { label: msg.trayPlayPause, click: withShell((w) => w.webContents.send('media:playPause')) },
    { label: msg.trayNext, click: withShell((w) => w.webContents.send('media:next')) },
    { label: msg.trayPrevious, click: withShell((w) => w.webContents.send('media:previous')) },
    { type: 'separator' },
    ...(modeOptions?.canToggleMode()
      ? [
          {
            label: msg.trayToggleMode,
            click: () => modeOptions?.toggleMode()
          },
          { type: 'separator' as const }
        ]
      : []),
    { label: msg.trayShow, click: showShell },
    { type: 'separator' },
    {
      label: msg.trayQuit,
      click: () => {
        destroyTray();
        app.quit();
      }
    }
  ]);
}

/** Przebudowuje etykiety po zmianie locale (mainMessages jest już ustawione). */
export function refreshTray(): void {
  if (!tray || tray.isDestroyed()) return;
  tray.setToolTip(mainMessages().trayTooltip);
  tray.setContextMenu(buildMenu());
}

export function setupTray(
  getShellWindow: () => BrowserWindow | null,
  mode?: TrayModeOptions
): void {
  getShellWindowRef = getShellWindow;
  modeOptions = mode ?? null;

  if (!tray) {
    const trayImage = trayIcon();
    if (!trayImage) return;
    tray = new Tray(trayImage);
    tray.on('double-click', showShell);
  }
  refreshTray();
}
