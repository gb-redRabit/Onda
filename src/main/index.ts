import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { createMediaServer } from './media-server';
import { registerOndaProtocolHandler } from './protocol';
import { registerWindowHandlers } from './window-ipc';
import icon from '../../resources/icon.png?asset';
import { registerIPC } from './ipc/handlers';
import { pipManager } from './pip-manager';
import { audioPipManager } from './audio-pip-manager';
import { logger } from '../shared/logger';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let mainReady = false;
let minTimerDone = false;
const preFullscreenBounds: { current: Electron.Rectangle | null } = { current: null };

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f17',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  win.on('ready-to-show', () => {
    if (!splashWindow) win.show();
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

  win.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      win.hide();
    }
  });

  win.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url);
      if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
        shell.openExternal(details.url);
      }
    } catch (e) {
      logger.warn('main', 'setWindowOpenHandler: invalid URL', details.url, e);
    }
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
      webSecurity: true
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
    } catch (e) {
      logger.warn('main', `global shortcut unavailable: ${accelerator}`, e);
    }
  }
}

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      sandbox: true
    }
  });

  splash.loadFile(join(__dirname, '../../resources/splash.html'));
  return splash;
}

function checkAndShow(): void {
  if (mainReady && minTimerDone) {
    splashWindow?.close();
    splashWindow = null;
    mainWindow?.show();
    mainWindow?.focus();
  }
}

function onMainReady(): void {
  mainReady = true;
  checkAndShow();
}

function forceCloseSplash(): void {
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
    if (!mainWindow?.isVisible()) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.onda.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  splashWindow = createSplashWindow();

  registerIPC();

  const mediaServer = await createMediaServer();
  const mediaServerUrl = `http://127.0.0.1:${mediaServer.port}/${mediaServer.token}`;

  ipcMain.on('media:getServerUrlSync', (event) => {
    event.returnValue = mediaServerUrl;
  });

  ipcMain.on('window:idSync', (event) => {
    const id = BrowserWindow.fromWebContents(event.sender)?.id ?? 0;
    event.returnValue = id;
  });

  ipcMain.handle('app:quit', () => {
    tray?.destroy();
    tray = null;
    app.quit();
  });

  app.on('will-quit', () => {
    mediaServer.close();
  });

  registerOndaProtocolHandler();

  mainWindow = createWindow();
  mainWindow.webContents.on('did-finish-load', onMainReady);
  pipManager.setMainWindow(mainWindow);
  pipManager.init();
  audioPipManager.setMainWindow(mainWindow);
  audioPipManager.init();
  setupTray();
  registerGlobalShortcuts();

  setTimeout(() => {
    minTimerDone = true;
    checkAndShow();
  }, 1000);

  setTimeout(forceCloseSplash, 15000);

  registerWindowHandlers({
    getMainWindow: () => mainWindow,
    preFullscreenBounds,
    createChildWindow: (parent, options) => createChildWindow(parent, options),
    pipManager,
    audioPipManager
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.webContents.on('did-finish-load', onMainReady);
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
  splashWindow?.destroy();
  splashWindow = null;
  pipManager.destroy();
  audioPipManager.destroy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
