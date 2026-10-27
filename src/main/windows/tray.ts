import { app, Menu, Tray, type BrowserWindow } from 'electron';
import { trayIcon } from './window-icon';

// Ikona tray + menu kontekstowe wyodrębnione z `main/index.ts` (plan 2.8).
// Instancja tray żyje tutaj; wywołujący używają `setupTray`/`destroyTray`.

let tray: Tray | null = null;

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
}

export interface TrayModeOptions {
  /** Czy w tym trybie można przełączyć okno w trakcie działania. */
  canToggleMode: () => boolean;
  toggleMode: () => void;
}

export function setupTray(
  getShellWindow: () => BrowserWindow | null,
  mode?: TrayModeOptions
): void {
  const trayImage = trayIcon();
  if (!trayImage) return;
  tray = new Tray(trayImage);
  tray.setToolTip('Onda Player');

  const withShell = (fn: (win: BrowserWindow) => void) => (): void => {
    const shell = getShellWindow();
    if (shell && !shell.isDestroyed()) fn(shell);
  };
  const showShell = withShell((w) => {
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Play / Pause', click: withShell((w) => w.webContents.send('media:playPause')) },
    { label: 'Next', click: withShell((w) => w.webContents.send('media:next')) },
    { label: 'Previous', click: withShell((w) => w.webContents.send('media:previous')) },
    { type: 'separator' },
    ...(mode?.canToggleMode()
      ? [
          {
            label: 'Compact / Full window',
            click: () => mode.toggleMode()
          },
          { type: 'separator' as const }
        ]
      : []),
    { label: 'Show Onda', click: showShell },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        destroyTray();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', showShell);
}
