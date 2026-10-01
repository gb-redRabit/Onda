import { app, Menu, Tray, type BrowserWindow } from 'electron';
import { trayIcon } from './window-icon';

// Tray icon + context menu extracted from `main/index.ts` (plan 2.8). The tray
// instance lives here; callers use `setupTray`/`destroyTray`.

let tray: Tray | null = null;

export function hasTray(): boolean {
  return tray !== null;
}

export function destroyTray(): void {
  try {
    if (tray && !tray.isDestroyed()) tray.destroy();
  } catch {
    /* already destroyed */
  }
  tray = null;
}

export function setupTray(getMainWindow: () => BrowserWindow | null): void {
  const trayImage = trayIcon();
  if (!trayImage) return;
  tray = new Tray(trayImage);
  tray.setToolTip('Onda Player');

  const withMain = (fn: (win: BrowserWindow) => void) => (): void => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) fn(mainWindow);
  };
  const showMain = withMain((w) => {
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Play / Pause', click: withMain((w) => w.webContents.send('media:playPause')) },
    { label: 'Next', click: withMain((w) => w.webContents.send('media:next')) },
    { label: 'Previous', click: withMain((w) => w.webContents.send('media:previous')) },
    { type: 'separator' },
    { label: 'Show Onda', click: showMain },
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

  tray.on('double-click', showMain);
}
