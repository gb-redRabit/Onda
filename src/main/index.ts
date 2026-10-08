import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron';
import { join } from 'path';
import os from 'os';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { createMediaServer } from './media/media-server';
import { registerOndaProtocolHandler } from './protocol';
import { registerWindowHandlers, seedWindowMaterial } from './windows/window-ipc';
import { setAutoLaunch } from './windows/auto-launch';
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
import { jobs, jobAbortControllers } from './downloads/download-state';
import { killDownloadProcess } from './downloads/kill-download-process';
import {
  installProcessSafetyNets,
  installSessionHardening,
  installRendererRecovery
} from './bootstrap/safety-nets';
import { flushLibraryScanned, flushStats } from './ipc/library/library-store';
import { flushPlaybackPositions } from './ipc/playback-handlers';
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
import { GLASS_WINDOW_MATERIAL, GLASS_WINDOW_OPTS } from './windows/window-presets';
import { destroyTray, hasTray, setupTray } from './windows/tray';
import { SplashController } from './windows/splash';
import { registerGlobalShortcuts } from './bootstrap/global-shortcuts';
import { startBootWatchdog } from './bootstrap/boot-watchdog';
import { OpenFileForwarder } from './bootstrap/open-files';
import { initMainLocale, setMainLocale, mainMessages } from './i18n-main';
import { asPositiveNumber, asNonEmptyString } from './utils/store-guards';

let mainWindow: BrowserWindow | null = null;
let startHidden = false;
// Chroni jednorazowe asynchroniczne sprzątanie w handlerze `before-quit` poniżej.
let isAppQuitting = false;

// Górny limit opróżniania persystencji przy wyjściu. Bez niego zawieszony flush
// (np. niedostępny dysk sieciowy) blokowałby `app.quit()` na zawsze, zostawiając
// proces-widmo w tle.
const SHUTDOWN_FLUSH_TIMEOUT_MS = 5000;

const splash = new SplashController({
  windowIcon,
  getMainWindow: () => mainWindow,
  isStartHidden: () => startHidden
});

// Zapisuje fazę na osi czasu startu (Diagnostyka → Wydajność) i loguje ją.
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

function createWindow(): BrowserWindow {
  const win = createBrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    ...GLASS_WINDOW_OPTS,
    icon: windowIcon(),
    // `<webview>` dla osadzeń playerów inline (modal) — izolowana partycja
    // podglądu, wymuszana przez globalny guard w `preview-session`.
    webPreferences: { webviewTag: true },
    // Splash decyduje, kiedy okno główne pojawi się po raz pierwszy.
    onReadyToShow: (w) => {
      if (!splash.isActive() && !startHidden) w.show();
    }
  });

  // Okno powstało już z akrylem; zapamiętaj to, by motyw nie ustawiał go ponownie.
  if (GLASS_WINDOW_MATERIAL) seedWindowMaterial(win, GLASS_WINDOW_MATERIAL);

  win.on('close', (e) => {
    if (hasTray() && shouldCloseToTray()) {
      e.preventDefault();
      win.hide();
    }
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
    // Rozmiar cache okładek z Ustawienia → Biblioteka. Wartości pochodzą z pliku
    // JSON na dysku, więc są walidowane, a nie rzutowane.
    const library = store.get('library') as Record<string, unknown> | undefined;
    applyCoverCacheSettings(asPositiveNumber(library?.coverCacheMaxEntries));
    await initCoverCache();
    // Zapisane locale UI napędza teraz pozostałe komunikaty procesu głównego.
    const appearance = store.get('appearance') as Record<string, unknown> | undefined;
    setMainLocale(asNonEmptyString(appearance?.locale));
    const folders = store.get('libraryFolders', []);
    bootFolders = Array.isArray(folders) ? folders.length : 0;
    if (Array.isArray(folders)) {
      await setAllowedRoots(folders);
    }
    // Utrwala korzenie przyznane w czasie działania (katalogi wyjściowe pobierania,
    // otwarte pliki), aby pobrane media pozostały odtwarzalne po restarcie.
    let rootsPersistTimer: ReturnType<typeof setTimeout> | null = null;
    setRootsChangedHandler(() => {
      if (rootsPersistTimer) return;
      rootsPersistTimer = setTimeout(() => {
        rootsPersistTimer = null;
        void store.set('mediaRoots', getExtraRoots().slice(0, 50));
      }, 500);
    });
    // Zasiewa wcześniej przyznane korzenie plus domyślny katalog pobierania, aby
    // świeże pobrania i stare spoza biblioteki były serwowane od razu.
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
    // Stosuje utrwalone ustawienia ogólne (close-to-tray + synchronizacja
    // auto-uruchamiania + poziom/limit logów z Ustawienia → System → Logi).
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
    if (general?.autoLaunch !== undefined) {
      setAutoLaunch({ enabled: !!general.autoLaunch, hidden: !!general.startMinimized });
    }
  } catch (e) {
    logger.warn('main', 'seeding media server roots from library folders failed', e);
  }

  // Uruchomienie przy logowaniu z "start zminimalizowany" — trzymaj okno ukryte,
  // dopóki użytkownik nie otworzy go z tray.
  startHidden = process.argv.includes('--hidden');
  perf(`settings ready (${bootFolders} folders, ${bootRoots} roots)`);

  splash.send(mainMessages().bootStartingUi, 50);

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

  // Łagodne wyłączanie. `will-quit` jest synchroniczne: pętla zdarzeń Node jest
  // rozbierana, gdy tylko listener zwróci, więc asynchroniczne opróżnienia
  // rozpoczęte tam nigdy się nie kończą — ostatnie debounce'owane zapisy przepadają,
  // pliki .tmp mogą zostać, a pliki biblioteki/statystyk mogą pozostać w połowie
  // zapisane. Opóźnij wyjście raz na `before-quit`, zaczekaj na każde opróżnienie,
  // potem wyjdź naprawdę.
  app.on('before-quit', (event) => {
    if (isAppQuitting) return;
    event.preventDefault();
    isAppQuitting = true;
    void (async () => {
      try {
        globalShortcut.unregisterAll();
        // Zatrzymaj harmonogramy w tle, aby żadne przeglądanie yt-dlp/sieci nie zaczęło się podczas wyjścia.
        stopSubscriptionChecker();
        mediaServer.close();
        closeLoginWindow();
        // Najpierw zatrzymaj pracę: procesy potomne yt-dlp/ffmpeg i strumienie HTTP
        // inaczej piszą do plików w trakcie opróżniania persystencji (i przeżywają
        // zamknięcie aplikacji).
        for (const job of jobs.values()) {
          if (job.status !== 'downloading') continue;
          if (job.child) {
            try {
              killDownloadProcess(job.child);
            } catch {
              /* już nie istnieje */
            }
          } else {
            jobAbortControllers.get(job.id)?.abort();
          }
        }
        // Opróżnij debounce'owaną persystencję, aby ostatnie zmiany nie przepadły.
        // Limit czasu gwarantuje, że zamknięcie zawsze się kończy.
        const flushes = Promise.allSettled([
          // Linie zapisane podczas zamykania są tymi, które warto mieć, gdy
          // doprowadziła nas tu awaria.
          flushLogWrites(),
          flushLibraryScanned(),
          // Statystyki odtwarzania są debounce'owane (400 ms); opróżnij je, inaczej ostatnie odtworzenia przepadną.
          flushStats(),
          // Pozycje odtwarzania są debounce'owane (15 s) — bez tego ostatnie ~15 s przepada.
          flushPlaybackPositions(),
          // Kolejka pobierania jest debounce'owana (400 ms) — bez awaitowania
          // ostatni zapis mógł przepaść.
          flushQueueNow(),
          getStore().then((s) => s.set('mediaRoots', getExtraRoots().slice(0, 50)))
        ]);
        const shutdownTimeout = new Promise<'timeout'>((r) =>
          setTimeout(() => r('timeout'), SHUTDOWN_FLUSH_TIMEOUT_MS)
        );
        if ((await Promise.race([flushes, shutdownTimeout])) === 'timeout') {
          logger.warn(
            'main',
            `graceful shutdown flush exceeded ${SHUTDOWN_FLUSH_TIMEOUT_MS}ms — quitting anyway`
          );
        }
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
    getMainWindow: () => mainWindow,
    preFullscreenBounds,
    pipManager,
    audioPipManager
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.webContents.on('did-finish-load', () => splash.onMainReady());

      // 'window-all-closed' niszczy menedżery PiP, co usuwa ich listenery
      // ipcMain. Na macOS aplikacja nadal żyje, więc zainicjalizuj je tutaj na
      // nowo, inaczej PiP pozostanie zepsuty do pełnego restartu.
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
