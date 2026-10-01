import { BrowserWindow, BrowserWindowConstructorOptions, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { installNavigationGuard } from './navigation-guard';
import { windowIcon } from './window-icon';
import { logger } from '../../shared/logger';

// Jedyne miejsce, które buduje każde BrowserWindow w Onda (plan 2.8 / audit Top 2):
// wzmocnione webPreferences, strażnik nawigacji, zdarzenia stanu okna i polityka
// "otwieraj linki zewnętrzne w przeglądarce OS" były wcześniej kopiowane w każdym
// kreatorze okien. Wywołujący przekazują teraz tylko to, co naprawdę się różni.
export interface WindowFactoryOptions extends BrowserWindowConstructorOptions {
  /** Trasa SPA przekazywana jako hash URL (np. `/explorer/window/1`). */
  hash?: string;
  /** Dedykowany entry renderera zamiast SPA (np. `pip.html`). */
  htmlFile?: string;
  /** Pokaż + skup w `ready-to-show`. Ignorowane, gdy podano `onReadyToShow`. */
  autoShow?: boolean;
  /** Otwieraj http/https/mailto na zewnątrz i odrzucaj nawigację w oknie. */
  openExternal?: boolean;
  onReadyToShow?: (win: BrowserWindow) => void;
  onClosed?: (win: BrowserWindow) => void;
}

export function createWindow(options: WindowFactoryOptions): BrowserWindow {
  const {
    hash,
    htmlFile,
    autoShow = true,
    openExternal = true,
    icon,
    onReadyToShow,
    onClosed,
    webPreferences,
    ...browserOptions
  } = options;

  const win = new BrowserWindow({
    icon: icon ?? windowIcon(),
    ...browserOptions,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      ...webPreferences
    }
  });

  if (onReadyToShow) {
    win.on('ready-to-show', () => onReadyToShow(win));
  } else if (autoShow) {
    win.on('ready-to-show', () => {
      win.show();
      win.focus();
    });
  }

  if (onClosed) {
    win.on('closed', () => onClosed(win));
  }

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

  if (openExternal) {
    win.webContents.setWindowOpenHandler((details) => {
      try {
        const parsed = new URL(details.url);
        if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
          shell.openExternal(details.url);
        }
      } catch (e) {
        logger.warn('window', 'setWindowOpenHandler: invalid URL', details.url, e);
      }
      return { action: 'deny' };
    });
  }

  installNavigationGuard(win);

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (htmlFile) {
    if (is.dev && devUrl) void win.loadURL(`${devUrl}/${htmlFile}${hash ? `#${hash}` : ''}`);
    else void win.loadFile(join(__dirname, `../renderer/${htmlFile}`), hash ? { hash } : undefined);
  } else if (is.dev && devUrl) {
    void win.loadURL(hash ? `${devUrl}#${hash}` : devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined);
  }

  return win;
}
