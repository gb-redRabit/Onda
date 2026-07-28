import { ipcMain, BrowserWindow } from 'electron';
import type { PipManager } from './pip-manager';
import type { AudioPipManager } from './audio-pip-manager';

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
  const { getMainWindow, preFullscreenBounds, createChildWindow, pipManager, audioPipManager } = context;

  ipcMain.handle(
    'window:createChild',
    (
      _event,
      options: { title: string; width: number; height: number; alwaysOnTop?: boolean }
    ) => {
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
      audioPipManager.show(state, mode as 'minimal' | 'medium' | 'max', opacity, position as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left');
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
      if (position) audioPipManager.setPosition(position as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left');
      return true;
    }
  );
}
