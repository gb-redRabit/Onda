import { ipcMain, BrowserWindow, app } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { PipManager } from './pip-manager';
import type { AudioPipManager } from './audio-pip-manager';
import { logger } from '../shared/logger';
import { installNavigationGuard } from './navigation-guard';
import { pipWindowIcon } from './pip-icon';
import { getStore } from './ipc/cover-cache';

const explorerWindows = new Map<number, BrowserWindow>();
let imageViewerWindow: BrowserWindow | null = null;
let imageViewerData: { files: unknown[]; index: number } | null = null;

function createExplorerWindow(initialPath?: string, useAcrylic = false): number | null {
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
      ...(useAcrylic && process.platform === 'win32'
        ? { backgroundMaterial: 'acrylic' as const }
        : {
            transparent: true,
            backgroundColor: '#00000000'
          }),
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
    win.on('ready-to-show', () => win.show());
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

function getExplorerWindows(): BrowserWindow[] {
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

  ipcMain.handle('imageViewer:open', (_event, files: unknown[], index: number) => {
    imageViewerData = { files, index };
    if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
      imageViewerWindow.webContents.send('imageViewer:files', imageViewerData);
      imageViewerWindow.focus();
      return imageViewerWindow.id;
    }
    imageViewerWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      show: false,
      frame: false,
      titleBarStyle: 'hidden',
      title: 'Image Viewer',
      backgroundColor: '#0f0f17',
      fullscreen: true,
      fullscreenable: true,
      icon: pipWindowIcon(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });
    imageViewerWindow.setMenuBarVisibility(false);
    imageViewerWindow.on('ready-to-show', () => {
      imageViewerWindow?.show();
      imageViewerWindow?.setFullScreen(true);
    });
    imageViewerWindow.on('closed', () => {
      imageViewerWindow = null;
    });
    installNavigationGuard(imageViewerWindow);
    const hash = '/image-viewer';
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void imageViewerWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#' + hash);
    } else {
      void imageViewerWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash });
    }
    return imageViewerWindow.id;
  });

  ipcMain.handle('imageViewer:getData', () => {
    return imageViewerData;
  });

  ipcMain.handle('imageViewer:close', () => {
    if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
      imageViewerWindow.close();
    }
  });

  ipcMain.handle('explorer:create', async (_event, path?: string) => {
    let useAcrylic = false;
    try {
      const store = await getStore();
      const appearance = store.get('appearance') as { glassAlpha?: number } | undefined;
      useAcrylic = (appearance?.glassAlpha ?? 100) < 100 && process.platform === 'win32';
    } catch {
      /* ignore */
    }
    return createExplorerWindow(typeof path === 'string' ? path : undefined, useAcrylic);
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
        } catch {
          /* ignore */
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

  ipcMain.handle('audio-pip:autoHide', () => {
    audioPipManager.autoHide();
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
      audioPipManager.setModePosition(
        mode as 'minimal' | 'medium' | 'max' | 'wide' | undefined,
        position as
          'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'top' | 'bottom' | undefined
      );
      audioPipManager.update(state);
      if (opacity !== undefined) audioPipManager.setOpacity(opacity);
      return true;
    }
  );
}
