import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { createMediaServer, addAllowedRoot } from './media/media-server';
import { registerOndaProtocolHandler } from './protocol';
import { registerWindowHandlers } from './windows/window-ipc';
import { registerIPC } from './ipc/handlers';
import { pipManager } from './pip/pip-manager';
import { audioPipManager } from './pip/audio-pip-manager';
import { logger } from '../shared/logger';
import { extractMediaPaths } from './media/media-paths';
import { setMediaServerUrl, registerMediaUrlHandler } from './media/media-url-args';
import {
  installProcessSafetyNets,
  installSessionHardening,
  installRendererRecovery
} from './bootstrap/safety-nets';
import { setupFileLogging } from './log-file';
import { initAutoUpdater, replayUpdaterEvent } from './updater';
import { markBootPhase, markBootStart } from './boot-timeline';
import { configureAutoCheck } from './updater-scheduler';
import { syncSubscriptionsScheduler } from './ipc/subscriptions/subscriptions-handlers';
import { syncLinkSubsScheduler } from './ipc/providers/providers-handlers';
import { shouldCloseToTray } from './windows/close-behavior';
import { windowIcon } from './windows/window-icon';
import { createWindow as createBrowserWindow } from './windows/window-factory';
import { GLASS_WINDOW_OPTS } from './windows/window-presets';
import { destroyTray, hasTray, setupTray } from './windows/tray';
import { SplashController } from './windows/splash';
import { startCoreService } from './core/core-spike';
import { createCompactWindow } from './compact/compact-window';
import { loadCompactState, saveCompactState, type WindowMode } from './compact/compact-state';
import { registerGlobalShortcuts } from './bootstrap/global-shortcuts';
import { startBootWatchdog } from './bootstrap/boot-watchdog';
import { OpenFileForwarder } from './bootstrap/open-files';
import { initMainLocale, mainMessages } from './i18n-main';
import { installGracefulShutdown } from './bootstrap/shutdown';
import { seedMediaServerAndSettings } from './bootstrap/seed-roots';

let mainWindow: BrowserWindow | null = null;
let compactWindow: BrowserWindow | null = null;
let startHidden = false;
let startupMode: WindowMode = 'main';
let coreShellEnabled = false;
let quitting = false;
let pipReady = false;

function activeShell(): BrowserWindow | null {
  if (startupMode === 'compact') {
    if (compactWindow && !compactWindow.isDestroyed()) return compactWindow;
    return mainWindow;
  }
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return compactWindow;
}

const splash = new SplashController({
  windowIcon,
  getMainWindow: () => activeShell(),
  isStartHidden: () => startHidden
});

app.on('before-quit', () => {
  quitting = true;
});

// Zapisuje fazę na osi czasu startu (Diagnostyka → Wydajność) i loguje ją.
function perf(label: string): number {
  const ms = markBootPhase(label);
  logger.info('boot', `${label} — ${ms}ms`);
  return ms;
}

const preFullscreenBounds: { current: Electron.Rectangle | null } = { current: null };

const openFiles = new OpenFileForwarder(
  () => activeShell(),
  (dir) => void addAllowedRoot(dir)
);

// Nadpisanie E2E/portable: kieruje cały profil (ustawienia, logi, tokeny) do
// katalogu jednorazowego, zanim cokolwiek go odczyta. Musi zadziałać przed
// blokadą pojedynczej instancji, która opiera się na userData.
if (process.env.ONDA_USER_DATA_DIR) {
  app.setPath('userData', process.env.ONDA_USER_DATA_DIR);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Skupia istniejące okno nawet przy uruchomieniu bez pliku (np. kliknięcie
    // ikony na pulpicie/pasku zadań) i przekazuje dalej ścieżki mediów.
    openFiles.forward(extractMediaPaths(argv));
  });
  app.on('open-file', (event, path) => {
    event.preventDefault();
    openFiles.forward(extractMediaPaths([path]));
  });
}

function createWindow(options: { showWhenReady?: boolean } = {}): BrowserWindow {
  const win = createBrowserWindow({
    width: 1200,
    height: 800,
    // Poniżej połowy typowych ekranów (1366×768 → 683, 1920×1080 → 540 wysokości),
    // inaczej Windows nie pozwala przykleić okna do krawędzi.
    minWidth: 640,
    minHeight: 480,
    show: false,
    ...GLASS_WINDOW_OPTS,
    icon: windowIcon(),
    // `<webview>` dla osadzeń playerów inline (modal) — izolowana partycja
    // podglądu, wymuszana przez globalny guard w `preview-session`.
    webPreferences: { webviewTag: true },
    // Splash decyduje, kiedy okno główne pojawi się po raz pierwszy.
    onReadyToShow: (w) => {
      if (options.showWhenReady) {
        w.show();
        w.focus();
        return;
      }
      if (!splash.isActive() && !startHidden) w.show();
    }
  });

  win.on('close', (e) => {
    if (hasTray() && shouldCloseToTray()) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Diagnostyka startu: renderer, który nigdy nie kończy ładowania, wygląda
  // inaczej jak ciche zawieszenie (żadne okno nie jest pokazywane). Prawdziwa
  // awaria renderera od razu pokazuje okno (z zalogowanym błędem), zamiast
  // zostawiać użytkownika wpatrzonego w splash.
  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 (ERR_ABORTED) to normalny artefakt nawigacji/przeładowania, nie awaria.
      if (errorCode === -3) return;
      logger.error('main', `did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
      if (!isMainFrame) return;
      // Awaria ramki głównej zostawia aplikację całkiem bez UI: wyjaśnij to
      // zamiast pokazywać puste (białe/akrylowe) okno. W trybie dev zwykłą
      // przyczyną jest niedziałający serwer dev Vite.
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
  // Crash renderera: zamknij splash i spróbuj odzyskać okno (reload z limitem).
  installRendererRecovery(win, () => splash.forceClose());

  return win;
}

function wireMainWindow(win: BrowserWindow): void {
  win.webContents.on('did-start-loading', () => openFiles.resetListening());
  if (coreShellEnabled) {
    win.webContents.on('console-message', (_event, level, message) => {
      if (message.includes('[core-shell]')) {
        logger.info('core-shell', `shell console [${level}]: ${message}`);
      }
    });
  }
}

function wireCompactWindow(win: BrowserWindow): void {
  win.on('closed', () => {
    compactWindow = null;
  });
  win.webContents.on('console-message', (_event, level, message) => {
    if (message.includes('[core-shell]') || message.includes('[compact]')) {
      logger.info('compact', `console [${level}]: ${message}`);
    }
  });
}

function initPipForMain(win: BrowserWindow): void {
  if (pipReady) {
    pipManager.setMainWindow(win);
    audioPipManager.setMainWindow(win);
    return;
  }
  pipReady = true;
  pipManager.setMainWindow(win);
  pipManager.init();
  audioPipManager.setMainWindow(win);
  audioPipManager.init();
}

async function switchWindowMode(mode: WindowMode): Promise<void> {
  if (mode !== 'main' && mode !== 'compact') return;
  if (mode === startupMode) return;

  if (mode === 'compact' && !coreShellEnabled) {
    // Start w trybie klasycznym nie ma Core — przełączamy przez restart, żeby
    // nie mieć dwóch właścicieli audio.
    await saveCompactState({ mode: 'compact' });
    quitting = true;
    app.relaunch();
    app.quit();
    return;
  }

  await saveCompactState({ mode });
  startupMode = mode;

  if (mode === 'compact') {
    if (!compactWindow || compactWindow.isDestroyed()) {
      compactWindow = createCompactWindow({
        state: await loadCompactState(),
        showOnReady: true,
        hideOnClose: () => !quitting
      });
      wireCompactWindow(compactWindow);
    } else {
      compactWindow.show();
      compactWindow.focus();
    }
    mainWindow?.hide();
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow({ showWhenReady: true });
    wireMainWindow(mainWindow);
    mainWindow.webContents.once('did-finish-load', () => {
      splash.onMainReady();
      compactWindow?.hide();
    });
    initPipForMain(mainWindow);
  } else {
    mainWindow.show();
    mainWindow.focus();
    compactWindow?.hide();
  }
}

app.whenReady().then(async () => {
  markBootStart();
  perf('boot start');
  if (!gotSingleInstanceLock) return;

  electronApp.setAppUserModelId('com.onda.app');

  // Komunikaty procesu głównego (splash, okna dialogowe) podążają za locale OS,
  // dopóki zapisane ustawienie nie zostanie odczytane poniżej.
  initMainLocale();

  setupFileLogging();

  // Globalne handlery błędów: niewyłapany błąd w handlerze IPC nie może ubić
  // procesu bez śladu w logu. Uprawnienia sesji: deny-by-default (m.in. zdalne
  // okno logowania YouTube nie dostaje domyślnego dostępu do urządzeń).
  installProcessSafetyNets();
  installSessionHardening();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  splash.start();

  splash.send(mainMessages().bootMediaServer, 10);

  registerIPC({ getMainWindow: () => activeShell() });
  registerMediaUrlHandler();

  const mediaServer = await createMediaServer();
  setMediaServerUrl(`http://127.0.0.1:${mediaServer.port}/${mediaServer.token}`);
  logger.info(
    'boot',
    `media server port=${mediaServer.port} ${markBootPhase('media server ready')}ms`
  );

  splash.send(mainMessages().bootRestoringSettings, 25);

  const { folders: bootFolders, roots: bootRoots } = await seedMediaServerAndSettings();

  // Tryb startu: plik `compact-window-state.json` (wybór użytkownika), a `ONDA_COMPACT`
  // tylko nadpisuje go w dev/testach bez zapisu.
  const savedState = await loadCompactState();
  startupMode = process.env.ONDA_COMPACT === '1' ? 'compact' : savedState.mode;
  coreShellEnabled = process.env.ONDA_CORE_SHELL === '1' || startupMode === 'compact';
  // Uruchomienie przy logowaniu z "start zminimalizowany" — trzymaj okno ukryte,
  // dopóki użytkownik nie otworzy go z tray.
  startHidden = process.argv.includes('--hidden');
  perf(`settings ready (${bootFolders} folders, ${bootRoots} roots, mode=${startupMode})`);

  splash.send(mainMessages().bootStartingUi, 50);

  ipcMain.handle('app:isCoreShell', () => coreShellEnabled);
  ipcMain.handle('app:getWindowMode', () => startupMode);
  ipcMain.handle('app:setWindowMode', async (_event, mode: unknown) => {
    if (mode === 'main' || mode === 'compact') await switchWindowMode(mode);
  });
  ipcMain.handle('app:hideCompact', () => {
    compactWindow?.hide();
  });
  ipcMain.handle('app:getStartupMode', async () => (await loadCompactState()).mode);
  ipcMain.handle('app:setStartupMode', async (_event, mode: unknown) => {
    if (mode === 'main' || mode === 'compact') await saveCompactState({ mode });
  });
  ipcMain.handle('app:getCompactPinned', () => compactWindow?.isAlwaysOnTop() ?? false);
  ipcMain.handle('app:setCompactPinned', async (_event, pinned: unknown) => {
    const value = pinned === true;
    compactWindow?.setAlwaysOnTop(value);
    await saveCompactState({ alwaysOnTop: value });
  });

  ipcMain.handle('app:rendererReady', (event) => {
    perf('renderer ready');
    splash.onRendererReady();
    // Renderer może zamontować się po tym, jak zdarzenie aktualizacji już
    // wystrzeliło (sprawdzenie przy starcie, przeładowanie, ponowna aktywacja
    // macOS) — odtwórz ostatnie, aby globalne powiadomienie nie przepadło.
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

  // Łagodne wyłączanie: opróżnia debounce'owaną persystencję i zatrzymuje pracę
  // w tle przed `app.quit()` (szczegóły w `bootstrap/shutdown.ts`).
  installGracefulShutdown({ getMediaServer: () => mediaServer });

  registerOndaProtocolHandler();

  splash.send(mainMessages().bootCreatingWindow, 60);
  if (coreShellEnabled || process.env.ONDA_CORE_SPIKE === '1') {
    // Core startuje przed shellem, żeby pierwsze komendy (np. przywrócenie sesji)
    // nie przepadły. Stan jest cache'owany do momentu, gdy shell się podłączy.
    startCoreService({
      testShell: process.env.ONDA_CORE_SPIKE === '1',
      getShellWindow: () => activeShell()
    });
  }

  if (startupMode === 'compact') {
    compactWindow = createCompactWindow({
      state: savedState,
      showOnReady: false,
      hideOnClose: () => !quitting
    });
    wireCompactWindow(compactWindow);
    compactWindow.webContents.on('did-finish-load', () => {
      perf('compact did-finish-load');
      splash.onMainReady();
    });
    perf('compact window created');
  } else {
    mainWindow = createWindow();
    perf('window created');
    wireMainWindow(mainWindow);
    mainWindow.webContents.on('did-finish-load', () => {
      perf('did-finish-load');
      splash.onMainReady();
    });
  }

  splash.send(mainMessages().bootPipTray, 75);
  initAutoUpdater(() => activeShell()?.webContents ?? null);
  configureAutoCheck();
  syncSubscriptionsScheduler();
  void syncLinkSubsScheduler();
  if (mainWindow) initPipForMain(mainWindow);
  setupTray(() => activeShell(), {
    canToggleMode: () => coreShellEnabled,
    toggleMode: () => {
      void switchWindowMode(startupMode === 'compact' ? 'main' : 'compact');
    }
  });
  registerGlobalShortcuts(() => activeShell());
  perf('PiP/tray/shortcuts ready');

  // Przekaż pliki mediów podane w wierszu poleceń (Windows/Linux), gdy
  // renderer zamontuje już swoje listenery IPC (pull-based przez app:getPendingFiles).
  const initialPaths = extractMediaPaths(process.argv.slice(1));
  if (initialPaths.length > 0) {
    openFiles.forward(initialPaths);
  }

  // Minimalny czas wyświetlania splasha to jedynie dolny limit przeciw migotaniu:
  // okno jest pokazywane, gdy JEDNOCZEŚNIE proces główny zakończy ładowanie ORAZ
  // renderer zgłosi app:rendererReady. Trzymanie tego krótkim (~300 ms) unika
  // sztucznego opóźnienia startu, który i tak jest gotowy znacznie poniżej sekundy
  // (patrz logi `perf`).
  setTimeout(() => {
    splash.onMinTimerDone();
  }, 300);

  // Watchdog: nigdy nie ukrywaj zepsutego renderera za splashem na zawsze, ale też
  // nigdy nie pokazuj niepomalowanego (białego) okna tylko dlatego, że renderer
  // jest wolny (zimny serwer dev, pierwszy start po czyszczeniu cache, wolny dysk).
  // Ostrzegaj co kilka sekund i wymuś okno dopiero w terminie — prawdziwe awarie
  // (crash, fail-load, błąd preload) wołają `forceClose()` natychmiast.
  startBootWatchdog({
    isRendererReady: () => splash.isRendererReady(),
    onTimeout: () => splash.forceClose()
  });

  registerWindowHandlers({
    getMainWindow: () => activeShell(),
    preFullscreenBounds,
    pipManager,
    audioPipManager
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      wireMainWindow(mainWindow);
      mainWindow.webContents.on('did-finish-load', () => splash.onMainReady());
      initPipForMain(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  destroyTray();
  pipManager.destroy();
  audioPipManager.destroy();
  pipReady = false;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
