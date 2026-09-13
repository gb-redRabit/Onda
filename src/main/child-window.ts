import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { installNavigationGuard } from './navigation-guard';
import { windowIcon } from './window-icon';

// Frameless child player window extracted from `main/index.ts` (plan 2.8).

export function createChildWindow(
  parent: BrowserWindow,
  options: { title: string; width: number; height: number; alwaysOnTop?: boolean }
): BrowserWindow {
  const child = new BrowserWindow({
    parent,
    width: options.width,
    height: options.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: options.alwaysOnTop ?? true,
    skipTaskbar: true,
    icon: windowIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  child.on('ready-to-show', () => {
    child.show();
  });

  child.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url);
      if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
        shell.openExternal(details.url);
      }
    } catch {
      // invalid URL — ignore
    }
    return { action: 'deny' };
  });

  installNavigationGuard(child);

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    child.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/player');
  } else {
    child.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/player' });
  }

  return child;
}
