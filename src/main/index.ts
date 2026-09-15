import { app, BrowserWindow, ipcMain, globalShortcut, shell } from 'electron';
import { join, dirname } from 'path';
import os from 'os';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { createMediaServer } from './media-server';
import { registerOndaProtocolHandler } from './protocol';
import { registerWindowHandlers } from './window-ipc';
import { registerIPC } from './ipc/handlers';
import { pipManager } from './pip-manager';
import { audioPipManager } from './audio-pip-manager';
import { closeLoginWindow } from './youtube-auth';
import { logger } from '../shared/logger';
import { extractMediaPaths } from './media-paths';
import { setMediaServerUrl, registerMediaUrlHandler } from './media-url-args';
import {
  setAllowedRoots,
  addAllowedRoot,
  setRootsChangedHandler,
  getExtraRoots
} from './media-server';
import { getStore } from './ipc/cover-cache';
import { flushQueueNow } from './downloads/download-manager';
import { flushLibraryScanned } from './ipc/library-store';
import { setupFileLogging } from './log-file';
import { initAutoUpdater } from './updater';
import { configureAutoCheck } from './updater-scheduler';
import { syncSubscriptionsScheduler } from './ipc/subscriptions-handlers';
import { shouldCloseToTray, setCloseToTray } from './close-behavior';
import { installNavigationGuard } from './navigation-guard';
import { windowIcon } from './window-icon';
import { createChildWindow } from './child-window';
import { destroyTray, hasTray, setupTray } from './tray';
import { SplashController } from './splash';

let mainWindow: BrowserWindow | null = null;
let startHidden = false;
let bootMark = 0;

const splash = new SplashController({
  windowIcon,
  getMainWindow: () => mainWindow,
  isStartHidden: () => startHidden
});

function perf(label: string) {
  const ms = Math.round(performance.now() - bootMark);
  logger.info('boot', `${label} — ${ms}ms`);
}

const preFullscreenBounds: { current: Electron.Rectangle | null } = { current: null };

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

// E2E/portable override: point the whole profile (settings, logs, tokens) at a
// throw-away directory before anything reads it. Must run before the
// single-instance lock, which is keyed off userData.
if (process.env.ONDA_USER_DATA_DIR) {
  app.setPath('userData', process.env.ONDA_USER_DATA_DIR);
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
    hasShadow: false,
    transparent: true,
    backgroundColor: '#00000000',
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
    ...(process.platform === 'darwin'
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
      : {}),
    icon: windowIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  win.on('ready-to-show', () => {
    if (!splash.isActive() && !startHidden) win.show();
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
    if (hasTray() && shouldCloseToTray()) {
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

  // Boot diagnostics: a renderer that never finishes loading otherwise looks
  // like a silent hang (no window is ever shown).
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('main', `did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error('main', `preload-error ${preloadPath}`, error);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error('main', 'render-process-gone', details);
  });

  installNavigationGuard(win);

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function registerGlobalShortcuts(): void {
  const sendIfAlive = (channel: string) => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel);
    }
  };
  const shortcuts: Record<string, () => void> = {
    MediaPlayPause: () => sendIfAlive('media:playPause'),
    MediaNextTrack: () => sendIfAlive('media:next'),
    MediaPreviousTrack: () => sendIfAlive('media:previous'),
    MediaStop: () => sendIfAlive('media:stop'),
    VolumeUp: () => sendIfAlive('media:volumeUp'),
    VolumeDown: () => sendIfAlive('media:volumeDown'),
    VolumeMute: () => sendIfAlive('media:toggleMute')
  };

  for (const [accelerator, handler] of Object.entries(shortcuts)) {
    try {
      globalShortcut.register(accelerator, handler);
    } catch (e) {
      logger.warn('main', `global shortcut unavailable: ${accelerator}`, e);
    }
  }
}

app.whenReady().then(async () => {
  bootMark = performance.now();
  perf('boot start');
  if (!gotSingleInstanceLock) return;

  electronApp.setAppUserModelId('com.onda.app');

  setupFileLogging();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  splash.start();

  splash.send('Inicjalizowanie serwera mediów…', 10);

  registerIPC();
  registerMediaUrlHandler();

  const mediaServer = await createMediaServer();
  setMediaServerUrl(`http://127.0.0.1:${mediaServer.port}/${mediaServer.token}`);
  logger.info(
    'boot',
    `media server port=${mediaServer.port} ${Math.round(performance.now() - bootMark)}ms`
  );

  splash.send('Przywracanie ustawień…', 25);

  let bootFolders = 0;
  let bootRoots = 0;

  try {
    const store = await getStore();
    const folders = store.get('libraryFolders', []);
    bootFolders = Array.isArray(folders) ? folders.length : 0;
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
    bootRoots = Array.isArray(storedRoots) ? storedRoots.length : 0;
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
    logger.info(
      'boot',
      `settings: folders=${bootFolders} roots=${bootRoots} — ${Math.round(performance.now() - bootMark)}ms`
    );
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
    } else if (general?.autoLaunch === false) {
      app.setLoginItemSettings({ openAtLogin: false });
    }
  } catch (e) {
    logger.warn('main', 'seeding media server roots from library folders failed', e);
  }

  // Started at login with "start minimized" â€” keep the window hidden until the
  // user opens it from the tray.
  startHidden = process.argv.includes('--hidden');
  perf(`settings ready (${bootFolders} folders, ${bootRoots} roots)`);

  splash.send('Uruchamianie interfejsu…', 50);

  ipcMain.handle('app:rendererReady', () => {
    splash.onRendererReady();
  });

  ipcMain.handle('window:id', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.id ?? 0;
  });

  ipcMain.handle('app:getPendingFiles', () => {
    const files = pendingOpenFiles;
    pendingOpenFiles = [];
    return files;
  });

  ipcMain.handle('app:quit', () => {
    destroyTray();
    app.quit();
  });

  app.on('will-quit', () => {
    mediaServer.close();
    closeLoginWindow();
    // Flush debounced persistence so the last ~0.5s of changes aren't lost.
    flushQueueNow();
    void flushLibraryScanned();
    void getStore().then((s) => s.set('mediaRoots', getExtraRoots().slice(0, 50)));
  });

  registerOndaProtocolHandler();

  splash.send('Tworzenie okna…', 60);
  mainWindow = createWindow();
  perf('window created');
  mainWindow.webContents.on('did-finish-load', () => splash.onMainReady());

  splash.send('Inicjalizacja PiP i tray…', 75);
  initAutoUpdater(() => mainWindow?.webContents ?? null);
  configureAutoCheck();
  syncSubscriptionsScheduler();
  pipManager.setMainWindow(mainWindow);
  pipManager.init();
  audioPipManager.setMainWindow(mainWindow);
  audioPipManager.init();
  setupTray(() => mainWindow);
  registerGlobalShortcuts();
  perf('PiP/tray/shortcuts ready');

  // Forward media files passed on the command line (Windows/Linux) once the
  // renderer has mounted its IPC listeners (pull-based via app:getPendingFiles).
  const initialPaths = extractMediaPaths(process.argv.slice(1));
  if (initialPaths.length > 0) {
    forwardOpenFiles(initialPaths);
  }

  setTimeout(() => {
    splash.onMinTimerDone();
  }, 1000);

  setTimeout(() => splash.forceClose(), 15000);

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
      mainWindow.webContents.on('did-finish-load', () => splash.onMainReady());
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  destroyTray();
  pipManager.destroy();
  audioPipManager.destroy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
