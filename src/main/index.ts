import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut } from 'electron';
import { join, extname, normalize, dirname } from 'path';
import os from 'os';
import { statSync } from 'fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { AUDIO_EXTS, VIDEO_EXTS } from '../shared/constants';
import { createMediaServer } from './media-server';
import { registerOndaProtocolHandler } from './protocol';
import { registerWindowHandlers } from './window-ipc';
import icon from '../../resources/icon.png?asset';
import { registerIPC } from './ipc/handlers';
import { pipManager } from './pip-manager';
import { audioPipManager } from './audio-pip-manager';
import { closeLoginWindow } from './youtube-auth';
import { logger } from '../shared/logger';
import { setMediaServerUrl, registerMediaUrlHandler } from './media-url-args';
import { setAllowedRoots, addAllowedRoot, setRootsChangedHandler, getExtraRoots } from './media-server';
import { getStore } from './ipc/cover-cache';
import { setupFileLogging } from './log-file';
import { initAutoUpdater } from './updater';
import { configureAutoCheck } from './updater-scheduler';
import { syncSubscriptionsScheduler } from './ipc/subscriptions-handlers';
import { shouldCloseToTray, setCloseToTray } from './close-behavior';
import { installNavigationGuard } from './navigation-guard';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let mainReady = false;
let minTimerDone = false;
let startHidden = false;
const preFullscreenBounds: { current: Electron.Rectangle | null } = { current: null };

const MEDIA_EXTS = new Set([...AUDIO_EXTS, ...VIDEO_EXTS]);

function isMediaFilePath(p: string): boolean {
  if (!p || p.startsWith('-')) return false;
  try {
    if (!MEDIA_EXTS.has(extname(p).toLowerCase())) return false;
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function extractMediaPaths(argv: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of argv) {
    if (!isMediaFilePath(a)) continue;
    const norm = normalize(a);
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

let pendingOpenFiles: string[] = [];

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function forwardOpenFiles(paths: string[]): void {
  if (paths.length) {
    // Grant the media server access to the folders of files opened from the OS.
    for (const p of paths) void addAllowedRoot(dirname(p));
    pendingOpenFiles.push(...paths);
  }
  focusMainWindow();
  if (!paths.length || !mainWindow || mainWindow.webContents.isLoading()) return;
  mainWindow.webContents.send('open-files', paths);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Focus the existing window even when launched without a file (e.g. clicking
    // the desktop/taskbar icon) and forward any media paths.
    forwardOpenFiles(extractMediaPaths(argv));
  });
  app.on('open-file', (event, path) => {
    event.preventDefault();
    forwardOpenFiles(extractMediaPaths([path]));
  });
}

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
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  win.on('ready-to-show', () => {
    if (!splashWindow && !startHidden) win.show();
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
    if (tray && shouldCloseToTray()) {
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

  installNavigationGuard(win);

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
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  child.on('ready-to-show', () => {
    child.show();
  });

  installNavigationGuard(child);

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
  installNavigationGuard(splash);
  return splash;
}

function checkAndShow(): void {
  if (mainReady && minTimerDone) {
    splashWindow?.close();
    splashWindow = null;
    if (!startHidden) {
      mainWindow?.show();
      mainWindow?.focus();
    }
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
    if (!startHidden && !mainWindow?.isVisible()) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  }
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;

  electronApp.setAppUserModelId('com.onda.app');

  setupFileLogging();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  splashWindow = createSplashWindow();

  registerIPC();
  registerMediaUrlHandler();

  const mediaServer = await createMediaServer();
  setMediaServerUrl(`http://127.0.0.1:${mediaServer.port}/${mediaServer.token}`);

  try {
    const store = await getStore();
    const folders = store.get('libraryFolders', []);
    if (Array.isArray(folders)) {
      await setAllowedRoots(folders);
    }
    // Persist roots granted at runtime (download output dirs, opened files)
    // so downloaded media stays playable after a restart.
    let rootsPersistTimer: ReturnType<typeof setTimeout> | null = null;
    setRootsChangedHandler(() => {
      if (rootsPersistTimer) return;
      rootsPersistTimer = setTimeout(() => {
        rootsPersistTimer = null;
        void store.set('mediaRoots', getExtraRoots().slice(0, 50));
      }, 500);
    });
    // Seed previously granted roots plus the default downloads dir, so fresh
    // downloads and old ones outside the library are servable right away.
    const storedRoots = store.get('mediaRoots', []);
    const seedRoots = new Set<string>([
      ...(Array.isArray(storedRoots) ? storedRoots : []),
      app.getPath('downloads'),
      // Transkodowane audio/wideo (fallback dla nieobsługiwanych kodeków) też
      // są serwowane przez media-server — katalogi muszą być w allowed roots.
      join(os.tmpdir(), 'onda', 'audio-transcodes'),
      join(os.tmpdir(), 'onda', 'video-transcodes')
    ]);
    for (const root of seedRoots) {
      await addAllowedRoot(root);
    }
    // Apply the persisted general settings (close-to-tray + auto-launch sync).
    const general = store.get('general') as
      { autoLaunch?: boolean; startMinimized?: boolean; closeToTray?: boolean } | undefined;
    if (general?.closeToTray !== undefined) setCloseToTray(general.closeToTray !== false);
    if (general?.autoLaunch) {
      app.setLoginItemSettings({
        openAtLogin: true,
        args: general.startMinimized ? ['--hidden'] : [],
        ...(process.platform === 'darwin' ? { openAsHidden: !!general.startMinimized } : {})
      });
    }
  } catch (e) {
    logger.warn('main', 'seeding media server roots from library folders failed', e);
  }

  // Started at login with "start minimized" — keep the window hidden until the
  // user opens it from the tray.
  startHidden = process.argv.includes('--hidden');

  ipcMain.handle('window:id', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.id ?? 0;
  });

  ipcMain.handle('app:getPendingFiles', () => {
    const files = pendingOpenFiles;
    pendingOpenFiles = [];
    return files;
  });

  ipcMain.handle('app:quit', () => {
    tray?.destroy();
    tray = null;
    app.quit();
  });

  app.on('will-quit', () => {
    mediaServer.close();
    closeLoginWindow();
  });

  registerOndaProtocolHandler();

  mainWindow = createWindow();
  mainWindow.webContents.on('did-finish-load', onMainReady);
  initAutoUpdater(() => mainWindow?.webContents ?? null);
  configureAutoCheck();
  syncSubscriptionsScheduler();
  pipManager.setMainWindow(mainWindow);
  pipManager.init();
  audioPipManager.setMainWindow(mainWindow);
  audioPipManager.init();
  setupTray();
  registerGlobalShortcuts();

  // Forward media files passed on the command line (Windows/Linux) once the
  // renderer has mounted its IPC listeners (pull-based via app:getPendingFiles).
  const initialPaths = extractMediaPaths(process.argv.slice(1));
  if (initialPaths.length > 0) {
    forwardOpenFiles(initialPaths);
  }

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
