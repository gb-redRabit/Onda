import { ipcMain, BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { PipManager } from './pip-manager';
import type { AudioPipManager } from './audio-pip-manager';

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
        sandbox: false,
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
    const hash = `/explorer/window/${id}${initialPath ? `?path=${encodeURIComponent(initialPath)}` : ''}`;
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#' + hash);
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash });
    }
    return id;
  } catch {
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
  const { getMainWindow, preFullscreenBounds, createChildWindow, pipManager, audioPipManager } =
    context;

  ipcMain.handle(
    'window:createChild',
    (_event, options: { title: string; width: number; height: number; alwaysOnTop?: boolean }) => {
      try {
        const mainWindow = getMainWindow();
        if (!mainWindow) return null;
        const child = createChildWindow(mainWindow, options);
        return child.id;
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle('explorer:create', (_event, path?: string) => {
    return createExplorerWindow(typeof path === 'string' ? path : undefined);
  });

  ipcMain.handle('explorer:list', () => {
    return getExplorerWindows().map((w) => w.id);
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

  ipcMain.handle('window:toggleFullscreen', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return false;
    const isFull = mainWindow.isFullScreen();
    if (isFull) {
      mainWindow.setFullScreen(false);
      if (preFullscreenBounds.current) {
        mainWindow.setBounds(preFullscreenBounds.current);
        preFullscreenBounds.current = null;
      }
      mainWindow.setResizable(false);
      mainWindow.setResizable(true);
      return false;
    } else {
      preFullscreenBounds.current = mainWindow.getBounds();
      mainWindow.setFullScreen(true);
      return true;
    }
  });

  ipcMain.handle('window:exitFullscreen', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;
    const isFull = mainWindow.isFullScreen();
    if (isFull) {
      mainWindow.setFullScreen(false);
      if (preFullscreenBounds.current) {
        mainWindow.setBounds(preFullscreenBounds.current);
        preFullscreenBounds.current = null;
      }
      mainWindow.setResizable(false);
      mainWindow.setResizable(true);
    }
  });

  ipcMain.handle('window:isFullscreen', () => {
    return getMainWindow()?.isFullScreen() ?? false;
  });

  ipcMain.handle('window:closeChild', (_event, childId: number) => {
    const child = BrowserWindow.fromId(childId);
    child?.close();
  });

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

  ipcMain.handle('pip:updatesrc', (_event, videoSrc: string, startTime?: number) => {
    pipManager.loadTrack(videoSrc, null);
    if (startTime !== undefined) pipManager.play(startTime);
  });

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
        mode as 'minimal' | 'medium' | 'max',
        opacity,
        position as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
      );
      return true;
    }
  );

  ipcMain.handle('audio-pip:hide', () => {
    audioPipManager.hide();
    return true;
  });

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
      if (mode) audioPipManager.setMode(mode as 'minimal' | 'medium' | 'max');
      audioPipManager.update(state);
      if (opacity !== undefined) audioPipManager.setOpacity(opacity);
      if (position)
        audioPipManager.setPosition(
          position as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
        );
      return true;
    }
  );
}
