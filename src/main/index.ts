import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron';
import { join } from 'path';
import os from 'os';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { createMediaServer } from './media/media-server';
import { registerOndaProtocolHandler } from './protocol';
import { registerWindowHandlers } from './windows/window-ipc';
import { registerIPC } from './ipc/handlers';
import { pipManager } from './pip/pip-manager';
import { audioPipManager } from './pip/audio-pip-manager';
import { closeLoginWindow } from './youtube/youtube-auth';
import { logger } from '../shared/logger';
import { extractMediaPaths } from './media/media-paths';
import { setMediaServerUrl, registerMediaUrlHandler } from './media/media-url-args';
import {
  setAllowedRoots,
  addAllowedRoot,
  setRootsChangedHandler,
  getExtraRoots
} from './media/media-server';
import { getStore } from './ipc/cover/cover-cache';
import { flushQueueNow } from './downloads/download-manager';
import { flushLibraryScanned, flushStats } from './ipc/library/library-store';
import { stopSubscriptionChecker } from './ipc/subscriptions/subscription-checker';
import { setupFileLogging, applyLogSettings, flushLogWrites } from './log-file';
import { applyCoverCacheSettings, initCoverCache } from './ipc/cover/cover-cache';
import { initAutoUpdater, replayUpdaterEvent } from './updater';
import { markBootPhase, markBootStart } from './boot-timeline';
import { configureAutoCheck } from './updater-scheduler';
import { syncSubscriptionsScheduler } from './ipc/subscriptions/subscriptions-handlers';
import { shouldCloseToTray, setCloseToTray } from './windows/close-behavior';
import { windowIcon } from './windows/window-icon';
import { createWindow as createBrowserWindow } from './windows/window-factory';
import { GLASS_WINDOW_OPTS } from './windows/window-presets';
import { destroyTray, hasTray, setupTray } from './windows/tray';
import { SplashController } from './windows/splash';
import { registerGlobalShortcuts } from './bootstrap/global-shortcuts';
import { startBootWatchdog } from './bootstrap/boot-watchdog';
import { OpenFileForwarder } from './bootstrap/open-files';
import { initMainLocale, setMainLocale, mainMessages } from './i18n-main';

let mainWindow: BrowserWindow | null = null;
let startHidden = false;
// Guards the one-shot async cleanup in the `before-quit` handler below.
let isAppQuitting = false;

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

const openFiles = new OpenFileForwarder(
  () => mainWindow,
  (dir) => void addAllowedRoot(dir)
);

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
    openFiles.forward(extractMediaPaths(argv));
  });
  app.on('open-file', (event, path) => {
    event.preventDefault();
    openFiles.forward(extractMediaPaths([path]));
  });
}

function createWindow(): BrowserWindow {
  const win = createBrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    ...GLASS_WINDOW_OPTS,
    icon: windowIcon(),
    // The splash owns when the main window first appears.
    onReadyToShow: (w) => {
      if (!splash.isActive() && !startHidden) w.show();
    }
  });

  win.on('close', (e) => {
    if (hasTray() && shouldCloseToTray()) {
      e.preventDefault();
      win.hide();
    }
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
      const m = mainMessages();
      const hint = is.dev ? m.loadFailedDevHint : '';
      dialog.showErrorBox(
        m.loadFailedTitle,
        `${m.loadFailedMessage(errorCode, errorDescription)}${hint}`
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

  return win;
}

app.whenReady().then(async () => {
  markBootStart();
  perf('boot start');
  if (!gotSingleInstanceLock) return;

  electronApp.setAppUserModelId('com.onda.app');

  // Main-process messages (splash, dialogs) follow the OS locale until the
  // saved setting is read below.
  initMainLocale();

  setupFileLogging();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  splash.start();

  splash.send(mainMessages().bootMediaServer, 10);

  registerIPC();
  registerMediaUrlHandler();

  const mediaServer = await createMediaServer();
  setMediaServerUrl(`http://127.0.0.1:${mediaServer.port}/${mediaServer.token}`);
  logger.info(
    'boot',
    `media server port=${mediaServer.port} ${markBootPhase('media server ready')}ms`
  );

  splash.send(mainMessages().bootRestoringSettings, 25);

  let bootFolders = 0;
  let bootRoots = 0;

  try {
    const store = await getStore();
    // Cover cache size from Settings → Library.
    const library = store.get('library') as { coverCacheMaxEntries?: number } | undefined;
    applyCoverCacheSettings(library?.coverCacheMaxEntries);
    await initCoverCache();
    // The saved UI locale now drives the remaining main-process messages.
    const appearance = store.get('appearance') as { locale?: string } | undefined;
    setMainLocale(appearance?.locale);
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

  splash.send(mainMessages().bootStartingUi, 50);

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
    return openFiles.takePending();
  });

  ipcMain.handle('app:quit', () => {
    destroyTray();
    app.quit();
  });

  // Graceful shutdown. `will-quit` is synchronous: the Node event loop is torn
  // down as soon as the listener returns, so async flushes started there never
  // finish — the last debounced writes are lost, .tmp files can be left behind
  // and the library/stats files can be left half-written. Delay the quit once
  // on `before-quit`, await every flush, then quit for real.
  app.on('before-quit', (event) => {
    if (isAppQuitting) return;
    event.preventDefault();
    isAppQuitting = true;
    void (async () => {
      try {
        globalShortcut.unregisterAll();
        // Stop background schedulers so no yt-dlp/network sweep starts during exit.
        stopSubscriptionChecker();
        mediaServer.close();
        closeLoginWindow();
        // Flush debounced persistence so the last ~0.5s of changes aren't lost.
        flushQueueNow();
        await Promise.allSettled([
          // The lines written during shutdown are the ones worth having when a
          // crash brought us here.
          flushLogWrites(),
          flushLibraryScanned(),
          // Play statistics are debounced (400ms); flush them or the last plays are lost.
          flushStats(),
          getStore().then((s) => s.set('mediaRoots', getExtraRoots().slice(0, 50)))
        ]);
      } catch (e) {
        logger.error('main', 'graceful shutdown failed', e);
      } finally {
        app.quit();
      }
    })();
  });

  registerOndaProtocolHandler();

  splash.send(mainMessages().bootCreatingWindow, 60);
  mainWindow = createWindow();
  perf('window created');
  mainWindow.webContents.on('did-finish-load', () => {
    perf('did-finish-load');
    splash.onMainReady();
  });

  splash.send(mainMessages().bootPipTray, 75);
  initAutoUpdater(() => mainWindow?.webContents ?? null);
  configureAutoCheck();
  syncSubscriptionsScheduler();
  pipManager.setMainWindow(mainWindow);
  pipManager.init();
  audioPipManager.setMainWindow(mainWindow);
  audioPipManager.init();
  setupTray(() => mainWindow);
  registerGlobalShortcuts(() => mainWindow);
  perf('PiP/tray/shortcuts ready');

  // Forward media files passed on the command line (Windows/Linux) once the
  // renderer has mounted its IPC listeners (pull-based via app:getPendingFiles).
  const initialPaths = extractMediaPaths(process.argv.slice(1));
  if (initialPaths.length > 0) {
    openFiles.forward(initialPaths);
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
  startBootWatchdog({
    isRendererReady: () => splash.isRendererReady(),
    onTimeout: () => splash.forceClose()
  });

  registerWindowHandlers({
    getMainWindow: () => mainWindow,
    preFullscreenBounds,
    pipManager,
    audioPipManager
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.webContents.on('did-finish-load', () => splash.onMainReady());

      // 'window-all-closed' destroys the PiP managers, which removes their
      // ipcMain listeners. On macOS the app is still alive, so re-initialise
      // them here or PiP stays broken until a full restart.
      pipManager.setMainWindow(mainWindow);
      pipManager.init();
      audioPipManager.setMainWindow(mainWindow);
      audioPipManager.init();
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
