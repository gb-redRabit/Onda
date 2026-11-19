import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { createMediaServer } from './media/media-server';
import { registerOndaProtocolHandler } from './protocol';
import { registerWindowHandlers } from './windows/window-ipc';
import { registerIPC } from './ipc/handlers';
import { pipManager } from './pip/pip-manager';
import { audioPipManager } from './pip/audio-pip-manager';
import { logger } from '../shared/logger';
import { extractMediaPaths } from './media/media-paths';
import { setMediaServerUrl, registerMediaUrlHandler } from './media/media-url-args';
import { installProcessSafetyNets, installSessionHardening } from './bootstrap/safety-nets';
import { setupFileLogging } from './log-file';
import { initAutoUpdater, replayUpdaterEvent } from './updater';
import { markBootPhase, markBootStart } from './boot-timeline';
import { configureAutoCheck } from './updater-scheduler';
import { syncSubscriptionsScheduler } from './ipc/subscriptions/subscriptions-handlers';
import { syncLinkSubsScheduler } from './ipc/providers/providers-handlers';
import { destroyTray, setupTray } from './windows/tray';
import { startCoreService } from './core/core-spike';
import { createCompactWindow } from './compact/compact-window';
import { loadCompactState, saveCompactState, type WindowMode } from './compact/compact-state';
import { registerGlobalShortcuts } from './bootstrap/global-shortcuts';
import { startBootWatchdog } from './bootstrap/boot-watchdog';
import { initMainLocale, mainMessages } from './i18n-main';
import { installGracefulShutdown, performShutdownTasks } from './bootstrap/shutdown';
import { registerShellIpc } from './bootstrap/shell-ipc';
import { seedMediaServerAndSettings } from './bootstrap/seed-roots';
import { relaunchApp } from './bootstrap/relaunch';
import { sendToWindow } from './utils/broadcast';
import {
  activeShell,
  openFiles,
  quitApp,
  sendShellActivity,
  shell,
  shouldHideShell,
  splash
} from './windows/shell-state';
import {
  createWindow,
  initPipForCompact,
  initPipForMain,
  wireCompactWindow,
  wireMainWindow
} from './windows/shell-windows';

/** Serializuje przełączenia trybu (IPC + tray mogą trafić równocześnie). */
let modeSwitch: Promise<void> | null = null;

app.on('before-quit', () => {
  shell.quitting = true;
});

// Zapisuje fazę na osi czasu startu (Diagnostyka → Wydajność) i loguje ją.
function perf(label: string): number {
  const ms = markBootPhase(label);
  logger.info('boot', `${label} — ${ms}ms`);
  return ms;
}

const preFullscreenBounds: { current: Electron.Rectangle | null } = { current: null };

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

/**
 * Prosi aktywny shell o synchroniczny zapis sesji przed restartem trybu.
 * Renderer odpowiada `app:session-handoff-ready`; timeout chroni przed
 * zawieszonym/nieobsługującym tego zdarzenia oknem.
 */
function prepareSessionHandoff(target: BrowserWindow | null): Promise<void> {
  if (!target || target.isDestroyed()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ipcMain.removeListener('app:session-handoff-ready', done);
      resolve();
    };
    const timer = setTimeout(done, 400);
    ipcMain.once('app:session-handoff-ready', done);
    target.webContents.send('app:prepare-session-handoff');
  });
}

async function switchWindowMode(mode: WindowMode): Promise<void> {
  if (mode !== 'main' && mode !== 'compact') return;
  // Bez serializacji dwa równoległe wywołania (menu/tray + IPC) przechodziły
  // przez `mode === shell.mode` przed zapisem stanu i tworzyły dwa okna.
  while (modeSwitch) await modeSwitch;
  let release!: () => void;
  modeSwitch = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await switchWindowModeLocked(mode);
  } finally {
    modeSwitch = null;
    release();
  }
}

async function switchWindowModeLocked(mode: WindowMode): Promise<void> {
  if (mode === shell.mode) return;

  if (mode === 'compact' && !shell.coreShellEnabled) {
    // Start w trybie klasycznym nie ma Core - proces musi wstać ponownie w trybie
    // Core, żeby nie mieć dwóch właścicieli audio. Restart jest automatyczny,
    // a sesję przenosimy jednorazowym znacznikiem w stanie okna.
    await prepareSessionHandoff(activeShell());
    await saveCompactState({ mode: 'compact', restoreSessionOnce: true });
    shell.quitting = true;
    logger.info('compact', 'legacy main -> compact: relaunching with Core shell');
    if (shell.shutdownCleanup) relaunchApp(300, shell.shutdownCleanup);
    else relaunchApp(300);
    return;
  }

  const previousShell = activeShell();

  await saveCompactState({ mode });
  shell.mode = mode;

  // PiP audio należy do poprzedniego shella — chowamy je i resetujemy stan hooka,
  // żeby nowy shell nie odziedziczył "aktywnego" PiP, którego nie kontroluje.
  if (shell.audioPipReady) {
    sendToWindow(previousShell, 'audio-pip:closed');
    audioPipManager.hide();
  }

  if (mode === 'compact') {
    if (!shell.compactWindow || shell.compactWindow.isDestroyed()) {
      shell.compactWindow = createCompactWindow({
        state: await loadCompactState(),
        showOnReady: true,
        hideOnClose: shouldHideShell
      });
      wireCompactWindow(shell.compactWindow, () => {
        logger.warn('compact', 'renderer recovery exhausted - opening full window');
        void switchWindowMode('main');
      });
      initPipForCompact(shell.compactWindow);
    } else {
      shell.compactWindow.show();
      shell.compactWindow.focus();
      initPipForCompact(shell.compactWindow);
    }
    shell.mainWindow?.hide();
    sendShellActivity();
    return;
  }

  if (!shell.mainWindow || shell.mainWindow.isDestroyed()) {
    shell.mainWindow = createWindow({ showWhenReady: true });
    wireMainWindow(shell.mainWindow);
    shell.mainWindow.webContents.once('did-finish-load', () => {
      splash.onMainReady();
      shell.compactWindow?.hide();
    });
    initPipForMain(shell.mainWindow);
  } else {
    shell.mainWindow.show();
    shell.mainWindow.focus();
    shell.compactWindow?.hide();
    // Powrót z compact po zniszczeniu PiP (np. zamknięcie compacta) musi
    // przepiąć menedżera z powrotem na główne okno.
    initPipForMain(shell.mainWindow);
  }
  sendShellActivity();
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

  // Serwer mediów i odczyt ustawień są niezależne: start serwera nie potrzebuje
  // korzeni, a seeding nie potrzebuje nasłuchującego portu. Uruchamiamy je
  // równolegle, żeby import electron-store nie dokładał się do czasu startu serwera.
  const mediaServerPromise = createMediaServer();
  const seedingPromise = seedMediaServerAndSettings();

  const mediaServer = await mediaServerPromise;
  setMediaServerUrl(`http://127.0.0.1:${mediaServer.port}/${mediaServer.token}`);
  logger.info(
    'boot',
    `media server port=${mediaServer.port} ${markBootPhase('media server ready')}ms`
  );

  splash.send(mainMessages().bootRestoringSettings, 25);

  const { folders: bootFolders, roots: bootRoots } = await seedingPromise;

  // Tryb startu: plik `compact-window-state.json` (wybór użytkownika), a `ONDA_COMPACT`
  // tylko nadpisuje go w dev/testach bez zapisu.
  const savedState = await loadCompactState();
  shell.mode = process.env.ONDA_COMPACT === '1' ? 'compact' : savedState.mode;
  shell.coreShellEnabled = process.env.ONDA_CORE_SHELL === '1' || shell.mode === 'compact';
  // Uruchomienie przy logowaniu z "start zminimalizowany" — trzymaj okno ukryte,
  // dopóki użytkownik nie otworzy go z tray.
  shell.startHidden = process.argv.includes('--hidden');
  perf(`settings ready (${bootFolders} folders, ${bootRoots} roots, mode=${shell.mode})`);

  splash.send(mainMessages().bootStartingUi, 50);

  registerShellIpc({
    isCoreShell: () => shell.coreShellEnabled,
    getWindowMode: () => shell.mode,
    setWindowMode: switchWindowMode,
    hideCompact: () => {
      shell.compactWindow?.hide();
    },
    getCompactPinned: () => shell.compactWindow?.isAlwaysOnTop() ?? false,
    setCompactPinned: async (pinned) => {
      shell.compactWindow?.setAlwaysOnTop(pinned);
      await saveCompactState({ alwaysOnTop: pinned });
    },
    isActiveShellSender: (senderId) => {
      const current = activeShell();
      return !!current && !current.isDestroyed() && current.webContents.id === senderId;
    },
    getPendingFiles: () => openFiles.takePending(),
    onRendererReady: (sender) => {
      perf('renderer ready');
      splash.onRendererReady();
      // Renderer może zamontować się po tym, jak zdarzenie aktualizacji już
      // wystrzeliło (sprawdzenie przy starcie, przeładowanie, ponowna aktywacja
      // macOS) — odtwórz ostatnie, aby globalne powiadomienie nie przepadło.
      replayUpdaterEvent(sender);
    },
    quit: quitApp
  });

  // Łagodne wyłączanie: opróżnia debounce'owaną persystencję i zatrzymuje pracę
  // w tle przed `app.quit()` (szczegóły w `bootstrap/shutdown.ts`).
  installGracefulShutdown({ getMediaServer: () => mediaServer });
  shell.shutdownCleanup = () => performShutdownTasks({ getMediaServer: () => mediaServer });

  registerOndaProtocolHandler();

  splash.send(mainMessages().bootCreatingWindow, 60);
  if (shell.coreShellEnabled || process.env.ONDA_CORE_SPIKE === '1') {
    // Core startuje przed shellem, żeby pierwsze komendy (np. przywrócenie sesji)
    // nie przepadły. Stan jest cache'owany do momentu, gdy shell się podłączy.
    startCoreService({
      testShell: process.env.ONDA_CORE_SPIKE === '1',
      getShellWindow: () => activeShell()
    });
  }

  if (shell.mode === 'compact') {
    shell.compactWindow = createCompactWindow({
      state: savedState,
      showOnReady: false,
      hideOnClose: shouldHideShell
    });
    wireCompactWindow(shell.compactWindow, () => {
      logger.warn('compact', 'renderer recovery exhausted - opening full window');
      void switchWindowMode('main');
    });
    initPipForCompact(shell.compactWindow);
    shell.compactWindow.webContents.on('did-finish-load', () => {
      perf('compact did-finish-load');
      splash.onMainReady();
    });
    perf('compact window created');
  } else {
    shell.mainWindow = createWindow();
    perf('window created');
    wireMainWindow(shell.mainWindow);
    shell.mainWindow.webContents.on('did-finish-load', () => {
      perf('did-finish-load');
      splash.onMainReady();
    });
  }

  splash.send(mainMessages().bootPipTray, 75);
  initAutoUpdater(() => activeShell()?.webContents ?? null);
  configureAutoCheck();
  syncSubscriptionsScheduler();
  void syncLinkSubsScheduler();
  if (shell.mainWindow) initPipForMain(shell.mainWindow);
  sendShellActivity();
  setupTray(() => activeShell(), {
    canToggleMode: () => true,
    toggleMode: () => {
      void switchWindowMode(shell.mode === 'compact' ? 'main' : 'compact');
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
    // W trybie Core/tray okno żyje, ale jest ukryte — `getAllWindows().length`
    // nigdy nie jest wtedy zerem, więc dawny warunek nie przywracał UI. Sprawdzamy
    // tylko okna faktycznie znane Electronowi, żeby nie „wskrzeszać” martwej referencji.
    const windows = BrowserWindow.getAllWindows();
    const existing =
      (shell.mainWindow && windows.includes(shell.mainWindow) ? shell.mainWindow : null) ??
      (shell.compactWindow && windows.includes(shell.compactWindow) ? shell.compactWindow : null);
    if (existing) {
      if (existing.isMinimized?.()) existing.restore?.();
      existing.show?.();
      existing.focus?.();
      return;
    }
    if (windows.length === 0) {
      shell.mainWindow = createWindow();
      wireMainWindow(shell.mainWindow);
      shell.mainWindow.webContents.on('did-finish-load', () => splash.onMainReady());
      initPipForMain(shell.mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  destroyTray();
  pipManager.destroy();
  audioPipManager.destroy();
  shell.pipReady = false;
  shell.audioPipReady = false;
  if (process.platform !== 'darwin') {
    quitApp();
  }
});
