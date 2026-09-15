import { ipcMain, BrowserWindow, app } from 'electron';
import type { PipManager } from './pip-manager';
import type { AudioPipManager } from './audio-pip-manager';
import type { AudioPipDock, AudioPipElementId } from '../shared/types/pip';
import { logger } from '../shared/logger';
import { setCloseToTray } from './close-behavior';
import { createExplorerWindow, getExplorerWindows } from './explorer-windows';
import { closeImageViewer, getImageViewerData, openImageViewer } from './image-viewer-window';

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

  ipcMain.handle('imageViewer:open', (_event, files: unknown[], index: number) => {
    return openImageViewer(files, index);
  });

  ipcMain.handle('imageViewer:getData', () => {
    return getImageViewerData();
  });

  ipcMain.handle('imageViewer:close', () => {
    closeImageViewer();
  });

  ipcMain.handle('explorer:create', async (_event, path?: string) => {
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

  ipcMain.handle('app:setBackgroundMaterial', (_event, material: string) => {
    if (process.platform !== 'win32') return false;
    const valid = ['auto', 'none', 'mica', 'acrylic', 'tabbed'];
    if (!valid.includes(material)) return false;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.setBackgroundMaterial(material as 'acrylic' | 'none');
        } catch (e) {
          logger.warn('window', 'setBackgroundMaterial failed for a window (non-fatal)', e);
        }
      }
    }
    return true;
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

  function restoreBounds(win: BrowserWindow) {
    if (!preFullscreenBounds.current) return;
    const bounds = preFullscreenBounds.current;
    preFullscreenBounds.current = null;
    const wasMaximized = (bounds as unknown as { wasMaximized?: boolean }).wasMaximized;
    if (wasMaximized) {
      win.maximize();
    } else {
      win.setBounds(bounds as Electron.Rectangle);
    }
    win.setResizable(false);
    win.setResizable(true);
  }

  ipcMain.handle('window:toggleFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    if (!win) return false;
    if (win.isFullScreen()) {
      win.setFullScreen(false);
      let fired = false;
      const doRestore = () => {
        if (fired) return;
        fired = true;
        restoreBounds(win);
      };
      win.once('leave-full-screen', doRestore);
      setTimeout(doRestore, 400);
      return false;
    } else {
      if (!preFullscreenBounds.current) {
        const b = win.getBounds();
        (b as unknown as { wasMaximized?: boolean }).wasMaximized = win.isMaximized();
        preFullscreenBounds.current = b;
      }
      win.setFullScreen(true);
      return true;
    }
  });

  ipcMain.handle('window:exitFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();
    if (!win || !win.isFullScreen()) return;
    win.setFullScreen(false);
    let fired = false;
    const doRestore = () => {
      if (fired) return;
      fired = true;
      restoreBounds(win);
    };
    win.once('leave-full-screen', doRestore);
    setTimeout(doRestore, 400);
  });

  ipcMain.handle('window:isFullscreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });

  ipcMain.handle('app:getAutoLaunch', (): { enabled: boolean; hidden: boolean } => {
    try {
      const s = app.getLoginItemSettings() as unknown as {
        openAtLogin: boolean;
        args?: string[];
        launchArgs?: string[];
      };
      const args = s.args ?? s.launchArgs ?? [];
      return { enabled: !!s.openAtLogin, hidden: args.includes('--hidden') };
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

  ipcMain.handle('app:setCloseToTray', (_event, value: boolean) => {
    setCloseToTray(!!value);
    return true;
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
      _event: unknown,
      state: Record<string, unknown>,
      opts?: {
        dock?: string;
        cornerElements?: string[];
        edgeElements?: string[];
        autoHide?: boolean;
      }
    ) => {
      audioPipManager.show(state, {
        dock: opts?.dock as AudioPipDock | undefined,
        cornerElements: opts?.cornerElements as AudioPipElementId[] | undefined,
        edgeElements: opts?.edgeElements as AudioPipElementId[] | undefined,
        autoHide: opts?.autoHide
      });
      return true;
    }
  );

  ipcMain.handle('audio-pip:hide', () => {
    audioPipManager.hide();
    return true;
  });

  ipcMain.handle('audio-pip:autoHide', () => {
    audioPipManager.autoHideNow();
    return true;
  });

  ipcMain.handle('audio-pip:prewarm', () => {
    audioPipManager.prewarm();
    return true;
  });

  ipcMain.handle(
    'audio-pip:previewStart',
    (
      _event: unknown,
      opts?: {
        dock?: string;
        cornerElements?: string[];
        edgeElements?: string[];
        autoHide?: boolean;
      }
    ) => {
      return audioPipManager.showPreview({
        dock: opts?.dock as AudioPipDock | undefined,
        cornerElements: opts?.cornerElements as AudioPipElementId[] | undefined,
        edgeElements: opts?.edgeElements as AudioPipElementId[] | undefined,
        autoHide: opts?.autoHide
      });
    }
  );

  ipcMain.handle('audio-pip:previewStop', () => {
    audioPipManager.hidePreview();
    return true;
  });

  ipcMain.handle(
    'audio-pip:previewUpdate',
    (
      _event: unknown,
      opts?: {
        dock?: string;
        cornerElements?: string[];
        edgeElements?: string[];
        autoHide?: boolean;
      }
    ) => {
      audioPipManager.updatePreview({
        dock: opts?.dock as AudioPipDock | undefined,
        cornerElements: opts?.cornerElements as AudioPipElementId[] | undefined,
        edgeElements: opts?.edgeElements as AudioPipElementId[] | undefined,
        autoHide: opts?.autoHide
      });
      return true;
    }
  );

  ipcMain.handle(
    'audio-pip:update',
    (
      _event: unknown,
      state: Record<string, unknown>,
      opts?: {
        dock?: string;
        cornerElements?: string[];
        edgeElements?: string[];
        autoHide?: boolean;
      }
    ) => {
      if (
        opts &&
        (opts.dock || opts.cornerElements || opts.edgeElements || opts.autoHide !== undefined)
      ) {
        audioPipManager.setLayout({
          dock: opts.dock as AudioPipDock | undefined,
          cornerElements: opts.cornerElements as AudioPipElementId[] | undefined,
          edgeElements: opts.edgeElements as AudioPipElementId[] | undefined,
          autoHide: opts.autoHide
        });
      }
      audioPipManager.update(state);
      return true;
    }
  );
}
