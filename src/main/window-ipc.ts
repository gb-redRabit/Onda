import { ipcMain, BrowserWindow, app } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { PipManager } from './pip-manager';
import type { AudioPipManager } from './audio-pip-manager';
import { logger } from '../shared/logger';

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
      title: 'Explorer',
      backgroundColor: '#0f0f17',
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
    win.on('ready-to-show', () => win.show());
    win.on('closed', () => {
      explorerWindows.delete(id);
    });
    win.on('enter-full-screen', () => {
      win.webContents.send('window:fullscreenChanged', true);
    });
    win.on('leave-full-screen', () => {
      win.webContents.send('window:fullscreenChanged', false);
    });
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

export function registerWindowHandlers(context: {
  getMainWindow: () => BrowserWindow | null;
  preFullscreenBounds: { current: Electron.Rectangle | null };
  createChildWindow: (
    parent: BrowserWindow,
    options: { title: string; width: number; height: number; alwaysOnTop?: boolean }
  ) => BrowserWindow;
  pipManager: PipManager;
  audioPipManager: AudioPipManager;
}): void {
  const { getMainWindow, preFullscreenBounds, pipManager, audioPipManager } = context;

  ipcMain.handle('explorer:create', (_event, path?: string) => {
    return createExplorerWindow(typeof path === 'string' ? path : undefined);
  });

  ipcMain.handle('explorer:tabMoved', (_event, sourceWindowId: number, path: string) => {
    const source = BrowserWindow.fromId(sourceWindowId);
    if (source && !source.isDestroyed()) {
      source.webContents.send('explorer:remove-tab', path);
    }
  });

  ipcMain.handle('explorer:sendTabToMain', (_event, path: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:add-tab', path);
    }
  });

  ipcMain.on('explorer:refreshAll', () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:refresh');
    }
    for (const w of getExplorerWindows()) {
      if (!w.isDestroyed()) w.webContents.send('explorer:refresh');
    }
  });

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('window:setAlwaysOnTop', (event, flag: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setAlwaysOnTop(flag);
  });

  ipcMain.handle('window:toggleFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    if (!win) return false;
    const isFull = win.isFullScreen();
    if (isFull) {
      win.setFullScreen(false);
      if (preFullscreenBounds.current) {
        win.setBounds(preFullscreenBounds.current);
        preFullscreenBounds.current = null;
      }
      win.setResizable(false);
      win.setResizable(true);
      return false;
    } else {
      preFullscreenBounds.current = win.getBounds();
      win.setFullScreen(true);
      return true;
    }
  });

  ipcMain.handle('window:exitFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    if (!win) return;
    const isFull = win.isFullScreen();
    if (isFull) {
      win.setFullScreen(false);
      if (preFullscreenBounds.current) {
        win.setBounds(preFullscreenBounds.current);
        preFullscreenBounds.current = null;
      }
      win.setResizable(false);
      win.setResizable(true);
    }
  });

  ipcMain.handle('window:isFullscreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });

  ipcMain.handle('app:getAutoLaunch', (): { enabled: boolean; hidden: boolean } => {
    try {
      const s = app.getLoginItemSettings();
      return { enabled: !!s.openAtLogin, hidden: process.argv.includes('--hidden') };
    } catch {
      return { enabled: false, hidden: false };
    }
  });

  ipcMain.handle(
    'app:setAutoLaunch',
    (_event, opts: { enabled: boolean; hidden?: boolean }): boolean => {
      try {
        const enabled = !!opts?.enabled;
        const hidden = !!opts?.hidden;
        app.setLoginItemSettings({
          openAtLogin: enabled,
          args: hidden ? ['--hidden'] : [],
          ...(process.platform === 'darwin' ? { openAsHidden: hidden } : {})
        });
        return true;
      } catch (e) {
        logger.warn('window', 'setAutoLaunch failed', e);
        return false;
      }
    }
  );

  ipcMain.handle(
    'pip:start',
    async (
      _event,
      videoSrc: string,
      pipSettings?: {
        position?: string;
        width?: number;
        height?: number;
        startTime?: number;
        subtitle?: {
          subContent: string;
          fonts: Array<{ name: string; data: number[] }>;
          availableFonts: Record<string, string>;
        } | null;
      }
    ) => {
      return pipManager.show({
        src: videoSrc,
        startTime: pipSettings?.startTime || 0,
        position: pipSettings?.position,
        width: pipSettings?.width,
        height: pipSettings?.height,
        subtitle: pipSettings?.subtitle || null
      });
    }
  );

  ipcMain.handle('pip:stop', () => {
    pipManager.stop();
    return true;
  });

  ipcMain.handle(
    'pip:previewStart',
    (_event, opts: { position?: string; width?: number; height?: number }) => {
      return pipManager.showPreview(opts);
    }
  );

  ipcMain.handle('pip:previewStop', () => {
    pipManager.hidePreview();
    return true;
  });

  ipcMain.handle(
    'pip:previewUpdate',
    (_event, opts: { position?: string; width?: number; height?: number }) => {
      pipManager.updatePreview(opts);
      return true;
    }
  );

  ipcMain.handle(
    'pip:preload',
    (
      _event,
      videoSrc: string,
      subtitleData: {
        subContent: string;
        fonts: Array<{ name: string; data: number[] }>;
        availableFonts: Record<string, string>;
      } | null
    ) => {
      pipManager.preload(videoSrc, subtitleData);
    }
  );

  ipcMain.handle(
    'pip:loadtrack',
    (
      _event,
      videoSrc: string,
      subtitleData: {
        subContent: string;
        fonts: Array<{ name: string; data: number[] }>;
        availableFonts: Record<string, string>;
      } | null
    ) => {
      pipManager.loadTrack(videoSrc, subtitleData);
    }
  );

  ipcMain.handle(
    'pip:updateSubtitle',
    (
      _event,
      data: {
        subContent: string;
        fonts: Array<{ name: string; data: number[] }>;
        availableFonts: Record<string, string>;
      } | null
    ) => {
      pipManager.updateSubtitle(data);
    }
  );

  ipcMain.handle(
    'audio-pip:show',
    (
      _event,
      state: {
        trackName: string;
        artist: string;
        coverData: string | null;
        isPlaying: boolean;
        currentTime: number;
        duration: number;
        volume: number;
      },
      mode?: string,
      opacity?: number,
      position?: string
    ) => {
      audioPipManager.show(
        state,
        mode as 'minimal' | 'medium' | 'max' | 'wide',
        opacity,
        position as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'top' | 'bottom'
      );
      return true;
    }
  );

  ipcMain.handle('audio-pip:hide', () => {
    audioPipManager.hide();
    return true;
  });

  ipcMain.handle(
    'audio-pip:previewStart',
    (_event, opts: { mode?: string; position?: string; opacity?: number }) => {
      return audioPipManager.showPreview(opts);
    }
  );

  ipcMain.handle('audio-pip:previewStop', () => {
    audioPipManager.hidePreview();
    return true;
  });

  ipcMain.handle(
    'audio-pip:previewUpdate',
    (_event, opts: { mode?: string; position?: string; opacity?: number }) => {
      audioPipManager.updatePreview(opts);
      return true;
    }
  );

  ipcMain.handle(
    'audio-pip:update',
    (
      _event,
      state: {
        trackName: string;
        artist: string;
        coverData: string | null;
        isPlaying: boolean;
        currentTime: number;
        duration: number;
        volume: number;
      },
      mode?: string,
      opacity?: number,
      position?: string
    ) => {
      if (mode) audioPipManager.setMode(mode as 'minimal' | 'medium' | 'max' | 'wide');
      audioPipManager.update(state);
      if (opacity !== undefined) audioPipManager.setOpacity(opacity);
      if (position)
        audioPipManager.setPosition(
          position as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'top' | 'bottom'
        );
      return true;
    }
  );
}
