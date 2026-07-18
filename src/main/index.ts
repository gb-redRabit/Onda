import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { registerIPC } from './ipc/handlers';
import { pipManager } from './pip-manager';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  win.on('ready-to-show', () => {
    win.show();
  });

  win.on('maximize', () => {
    win.webContents.send('window:maximized', true);
  });

  win.on('unmaximize', () => {
    win.webContents.send('window:maximized', false);
  });

  win.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      win.hide();
    }
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function createChildWindow(
  parent: BrowserWindow,
  options: { title: string; width: number; height: number; alwaysOnTop?: boolean }
): BrowserWindow {
  const child = new BrowserWindow({
    parent,
    width: options.width,
    height: options.height,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: options.alwaysOnTop ?? true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  child.on('ready-to-show', () => {
    child.show();
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    child.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/player');
  } else {
    child.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/player' });
  }

  return child;
}

function setupTray(): void {
  if (!icon) return;
  tray = new Tray(icon);
  tray.setToolTip('Onda Player');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Play / Pause', click: () => mainWindow?.webContents.send('media:playPause') },
    { label: 'Next', click: () => mainWindow?.webContents.send('media:next') },
    { label: 'Previous', click: () => mainWindow?.webContents.send('media:previous') },
    { type: 'separator' },
    {
      label: 'Show Onda',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function registerGlobalShortcuts(): void {
  const shortcuts: Record<string, () => void> = {
    MediaPlayPause: () => mainWindow?.webContents.send('media:playPause'),
    MediaNextTrack: () => mainWindow?.webContents.send('media:next'),
    MediaPreviousTrack: () => mainWindow?.webContents.send('media:previous'),
    MediaStop: () => mainWindow?.webContents.send('media:stop'),
    VolumeUp: () => mainWindow?.webContents.send('media:volumeUp'),
    VolumeDown: () => mainWindow?.webContents.send('media:volumeDown'),
    VolumeMute: () => mainWindow?.webContents.send('media:toggleMute')
  };

  for (const [accelerator, handler] of Object.entries(shortcuts)) {
    try {
      globalShortcut.register(accelerator, handler);
    } catch {
      // Some shortcuts may not be available on all platforms
    }
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.onda.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIPC();
  mainWindow = createWindow();
  pipManager.setMainWindow(mainWindow);
  pipManager.init();
  setupTray();
  registerGlobalShortcuts();

  ipcMain.handle(
    'window:createChild',
    (_event, options: { title: string; width: number; height: number; alwaysOnTop?: boolean }) => {
      if (!mainWindow) return null;
      const child = createChildWindow(mainWindow, options);
      return child.id;
    }
  );

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
  pipManager.destroy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
