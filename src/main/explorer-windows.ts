import { BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { logger } from '../shared/logger';
import { installNavigationGuard } from './navigation-guard';
import { pipWindowIcon } from './pip-icon';

// Explorer windows (secondary file-browser windows) extracted from
// `window-ipc.ts` (plan 2.8).

const explorerWindows = new Map<number, BrowserWindow>();

export function createExplorerWindow(initialPath?: string): number | null {
  try {
    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      show: false,
      frame: false,
      titleBarStyle: 'hidden',
      title: 'Explorer',
      hasShadow: false,
      transparent: true,
      backgroundColor: '#00000000',
      ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
      ...(process.platform === 'darwin'
        ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
        : {}),
      icon: pipWindowIcon(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });
    const id = win.id;
    explorerWindows.set(id, win);
    win.on('ready-to-show', () => {
      win.show();
      win.focus();
      win.moveTop();
      // upewnij się, że okno jest nad główną aplikacją
      win.setAlwaysOnTop(true);
      setTimeout(() => win.setAlwaysOnTop(false), 100);
    });
    win.on('closed', () => {
      explorerWindows.delete(id);
    });
    win.on('maximize', () => {
      win.webContents.send('window:maximized', true);
    });
    win.on('unmaximize', () => {
      win.webContents.send('window:maximized', false);
    });
    win.on('enter-full-screen', () => {
      win.webContents.send('window:fullscreenChanged', true);
    });
    win.on('leave-full-screen', () => {
      win.webContents.send('window:fullscreenChanged', false);
    });
    installNavigationGuard(win);
    const hash = `/explorer/window/${id}${initialPath ? `?path=${encodeURIComponent(initialPath)}` : ''}`;
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#' + hash);
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash });
    }
    return id;
  } catch (e) {
    logger.warn('window', 'createExplorerWindow failed', e);
    return null;
  }
}

export function getExplorerWindows(): BrowserWindow[] {
  return [...explorerWindows.values()];
}
