import { BrowserWindow, dialog } from 'electron';
import { is } from '@electron-toolkit/utils';
import { logger } from '../../shared/logger';
import { mainMessages } from '../i18n-main';
import { installRendererRecovery } from '../bootstrap/safety-nets';
import { createWindow as createBrowserWindow } from './window-factory';
import { GLASS_WINDOW_OPTS } from './window-presets';
import { windowIcon } from './window-icon';
import { pipManager } from '../pip/pip-manager';
import { audioPipManager } from '../pip/audio-pip-manager';
import {
  handleShellClosed,
  openFiles,
  sendShellActivity,
  shell,
  shouldHideShell,
  splash
} from './shell-state';

// Tworzenie i okablowanie obu shelli (pełne okno i compact) wraz z PiP.
// Decyzje o przełączaniu trybu i sekwencja startu zostają w `index.ts`.

export function createWindow(options: { showWhenReady?: boolean } = {}): BrowserWindow {
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
      if (!splash.isActive() && !shell.startHidden) w.show();
    }
  });

  win.on('close', (e) => {
    if (shouldHideShell()) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    if (shell.mainWindow === win) shell.mainWindow = null;
    handleShellClosed();
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

export function wireMainWindow(win: BrowserWindow): void {
  win.webContents.on('did-start-loading', () => openFiles.resetListening());
  win.webContents.on('did-finish-load', sendShellActivity);
  if (shell.coreShellEnabled) {
    win.webContents.on('console-message', (_event, level, message) => {
      if (message.includes('[core-shell]')) {
        logger.info('core-shell', `shell console [${level}]: ${message}`);
      }
    });
  }
}

/**
 * `onRecoveryExhausted` przełącza na pełne okno, gdy compact nie daje się
 * odzyskać; przekazywane z `index.ts`, żeby moduł okien nie znał trybu pracy.
 */
export function wireCompactWindow(win: BrowserWindow, onRecoveryExhausted: () => void): void {
  win.on('closed', () => {
    if (shell.compactWindow === win) shell.compactWindow = null;
    handleShellClosed();
  });
  win.webContents.on('did-finish-load', sendShellActivity);
  installRendererRecovery(win, () => {}, { onExhausted: onRecoveryExhausted });
  // `BrowserWindow.hide()` nie zmienia `document.visibilityState` w Electronie,
  // więc renderer nie może sam wykryć schowania do tray. Jawny sygnał pozwala
  // pokazać PiP audio przy ✕/Alt+F4, ale nie przy przełączeniu na pełne okno.
  win.on('hide', () => {
    if (win.isDestroyed()) return;
    win.webContents.send('compact:hidden', {
      autoPip: shell.mode === 'compact' && !shell.quitting
    });
  });
  win.on('show', () => {
    if (win.isDestroyed()) return;
    win.webContents.send('compact:shown');
    sendShellActivity();
  });
  win.webContents.on('console-message', (_event, level, message) => {
    if (message.includes('[core-shell]') || message.includes('[compact]')) {
      logger.info('compact', `console [${level}]: ${message}`);
    }
  });
}

export function initPipForMain(win: BrowserWindow): void {
  audioPipManager.setMainWindow(win);
  if (!shell.audioPipReady) {
    shell.audioPipReady = true;
    audioPipManager.init();
  }
  if (shell.pipReady) {
    pipManager.setMainWindow(win);
    return;
  }
  shell.pipReady = true;
  pipManager.setMainWindow(win);
  pipManager.init();
}

/**
 * Compact to audio-only shell, więc potrzebuje wyłącznie Audio PiP (okno wideo PiP
 * tworzyłoby zbędny, ukryty renderer). Gdy później otworzy się pełne okno,
 * `initPipForMain` dokończy inicjalizację wideo PiP.
 */
export function initPipForCompact(win: BrowserWindow): void {
  audioPipManager.setMainWindow(win);
  if (!shell.audioPipReady) {
    shell.audioPipReady = true;
    audioPipManager.init();
  }
}
