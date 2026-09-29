import { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog } from 'electron';
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
import { setupFileLogging, applyLogSettings, flushLogWrites } from './log-file';
import { applyCoverCacheSettings } from './ipc/cover-cache';
import { initAutoUpdater, replayUpdaterEvent } from './updater';
import { markBootPhase, markBootStart } from './boot-timeline';
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

const splash = new SplashController({
  windowIcon,
  getMainWindow: () => mainWindow,
  isStartHidden: () => startHidden
});

// Records the phase in the boot timeline (Diagnostics → Performance) and logs it.
function perf(label: string): number {
  const ms = markBootPhase(label);
  logger.info('boot', `${label} — ${ms}ms`);
  return ms;
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
  // like a silent hang (no window is ever shown). A real renderer failure also
  // surfaces the window right away (with the error logged) instead of leaving
  // the user staring at the splash.
  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 (ERR_ABORTED) is a normal navigation/reload artefact, not a failure.
      if (errorCode === -3) return;
      logger.error('main', `did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
      if (!isMainFrame) return;
      // A main-frame failure leaves the app with no UI at all: explain it
      // instead of showing an empty (white/acrylic) window. In dev the usual
      // cause is the Vite dev server not being up.
      const hint = is.dev
        ? '\n\nKompilacja dev: upewnij się, że działa dev server (npm run dev).'
        : '';
      dialog.showErrorBox(
        'Onda',
        `Nie udało się załadować interfejsu (${errorCode} ${errorDescription}).${hint}`
      );
      splash.forceClose();
    }
  );
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error('main', `preload-error ${preloadPath}`, error);
    splash.forceClose();
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error('main', 'render-process-gone', details);
    splash.forceClose();
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
  markBootStart();
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
    `media server port=${mediaServer.port} ${markBootPhase('media server ready')}ms`
  );

  splash.send('Przywracanie ustawień…', 25);

  let bootFolders = 0;
  let bootRoots = 0;

  try {
    const store = await getStore();
    // Cover cache size from Settings → Library.
    const library = store.get('library') as { coverCacheMaxEntries?: number } | undefined;
    applyCoverCacheSettings(library?.coverCacheMaxEntries);
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
    logger.info('boot', `settings: folders=${bootFolders} roots=${bootRoots}`);
    // Apply the persisted general settings (close-to-tray + auto-launch sync +
    // log level/file cap from Settings → System → Logs).
    const general = store.get('general') as
      | {
          autoLaunch?: boolean;
          startMinimized?: boolean;
          closeToTray?: boolean;
          logLevel?: string;
          logMaxSizeMB?: number;
        }
      | undefined;
    applyLogSettings(general?.logLevel, general?.logMaxSizeMB);
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

  // Started at login with "start minimized" — keep the window hidden until the
  // user opens it from the tray.
  startHidden = process.argv.includes('--hidden');
  perf(`settings ready (${bootFolders} folders, ${bootRoots} roots)`);

  splash.send('Uruchamianie interfejsu…', 50);

  ipcMain.handle('app:rendererReady', (event) => {
    perf('renderer ready');
    splash.onRendererReady();
    // The renderer may mount after an update event already fired (startup
    // check, reload, macOS re-activate) — replay the last one so the global
    // notification isn't lost.
    replayUpdaterEvent(event.sender);
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
    // Same for the log queue: the lines written during shutdown are the ones
    // worth having when a crash brought us here.
    void flushLogWrites();
    void flushLibraryScanned();
    void getStore().then((s) => s.set('mediaRoots', getExtraRoots().slice(0, 50)));
  });

  registerOndaProtocolHandler();

  splash.send('Tworzenie okna…', 60);
  mainWindow = createWindow();
  perf('window created');
  mainWindow.webContents.on('did-finish-load', () => {
    perf('did-finish-load');
    splash.onMainReady();
  });

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

  // Minimum splash display is only an anti-flicker floor: the window is shown as
  // soon as BOTH the main process finished loading AND the renderer signalled
  // app:rendererReady. Keeping this short (~300ms) avoids adding artificial delay
  // to a boot that is already ready in well under a second (see `perf` logs).
  setTimeout(() => {
    splash.onMinTimerDone();
  }, 300);

  // Watchdog: never hide a broken renderer behind the splash forever, but also
  // never flash an unpainted (white) window just because the renderer is slow
  // (cold dev server, first run after a cache clear, slow disk). Warn every few
  // seconds and only force the window at the deadline — real failures (crash,
  // fail-load, preload error) call `forceClose()` immediately.
  const BOOT_WATCHDOG_INTERVAL_MS = 5000;
  const BOOT_WATCHDOG_DEADLINE_MS = 30000;
  const bootWatchdogStart = Date.now();
  const bootWatchdog = setInterval(() => {
    if (splash.isRendererReady()) {
      clearInterval(bootWatchdog);
      return;
    }
    const elapsed = Date.now() - bootWatchdogStart;
    if (elapsed >= BOOT_WATCHDOG_DEADLINE_MS) {
      clearInterval(bootWatchdog);
      logger.warn('boot', `renderer not ready after ${elapsed}ms — showing the window anyway`);
      splash.forceClose();
      return;
    }
    logger.warn('boot', `renderer still booting (${elapsed}ms) — splash kept visible`);
  }, BOOT_WATCHDOG_INTERVAL_MS);

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
