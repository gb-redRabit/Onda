import { app, dialog, session } from 'electron';
import type { BrowserWindow, Session, WebContents } from 'electron';
import { fileURLToPath } from 'url';
import { logger } from '../../shared/logger';
import { isPathInside } from '../path-security';
import { mainMessages } from '../i18n-main';
import { AUTH_PARTITION } from '../youtube/youtube-auth-session';

// Siatki bezpieczeństwa procesu głównego: globalne handlery błędów, hardening
// uprawnień sesji i odzyskiwanie po crashu renderera. Zebrane tutaj, aby `index.ts`
// nie puchł, a polityka była w jednym miejscu.

/** Ile razy automatycznie przeładować renderer, zanim uznamy crash za trwały. */
const MAX_RENDERER_RELOADS = 2;

/**
 * Uprawnienia, których aplikacja faktycznie używa. Kamera, mikrofon, geolokalizacja,
 * powiadomienia web, schowek do odczytu itd. nie są potrzebne — odmowa domyślna.
 */
const ALLOWED_PERMISSIONS = new Set<string>(['fullscreen', 'clipboard-sanitized-write']);

function isTrustedAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol === 'file:') return isPathInside(app.getAppPath(), fileURLToPath(url));
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) return url.origin === new URL(devUrl).origin;
  } catch {
    return false;
  }
  return false;
}

/**
 * Deny-by-default dla uprawnień sesji. Bez tego Electron przyznaje większość
 * uprawnień automatycznie, a okno logowania YouTube ładuje treść zdalną.
 *
 * @param trusted predykat originu, z którego wolno żądać dozwolonych uprawnień;
 *   dla partycji z treścią zdalną podaj `() => false`.
 */
export function hardenSessionPermissions(ses: Session, trusted: (origin: string) => boolean): void {
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return trusted(requestingOrigin) && ALLOWED_PERMISSIONS.has(permission);
  });
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(trusted(details.requestingUrl) && ALLOWED_PERMISSIONS.has(permission));
  });
}

/** Uruchom raz, najlepiej tuż po `app.whenReady()` — łapie błędy z handlerów IPC. */
export function installSessionHardening(): void {
  hardenSessionPermissions(session.defaultSession, isTrustedAppOrigin);
  // Partycja logowania YouTube: treść zdalna, więc żadne uprawnienie nie jest zaufane.
  try {
    hardenSessionPermissions(session.fromPartition(AUTH_PARTITION), () => false);
  } catch (e) {
    logger.warn('main', 'failed to harden auth partition permissions', e);
  }
}

/**
 * Globalne handlery błędów procesu głównego. Bez nich niewyłapany błąd w jednym
 * z ~170 handlerów IPC kończy proces (albo zostawia go w niespójnym stanie) bez
 * żadnego śladu w logu.
 */
export function installProcessSafetyNets(): void {
  process.on('uncaughtException', (err) => {
    logger.error('main', 'uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('main', 'unhandledRejection', reason);
  });
}

/**
 * Crash renderera nie może zostawiać martwego, białego okna. Próbuje przeładować
 * (z limitem), a gdy to zawiedzie — pokazuje komunikat i zamyka aplikację.
 * `unresponsive` jest logowane (Electron i tak nie zabija procesu automatycznie).
 */
export function installRendererRecovery(win: BrowserWindow, onGone: () => void): void {
  let reloads = 0;
  const wc: WebContents = win.webContents;
  wc.on('render-process-gone', (_event, details) => {
    logger.error('main', 'render-process-gone', details);
    onGone();
    // Podczas normalnego zamykania / zabicia okna nie ma czego ratować.
    if (details.reason === 'clean-exit' || details.reason === 'killed' || win.isDestroyed()) return;
    if (reloads < MAX_RENDERER_RELOADS) {
      reloads += 1;
      logger.warn('main', `reloading renderer after crash (${reloads}/${MAX_RENDERER_RELOADS})`);
      wc.reload();
      return;
    }
    const m = mainMessages();
    dialog.showErrorBox(m.loadFailedTitle, m.rendererCrashMessage(details.reason));
    app.quit();
  });
  wc.on('unresponsive', () => logger.warn('main', 'renderer unresponsive — UI frozen'));
}
