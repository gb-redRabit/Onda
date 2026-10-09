import { app, session } from 'electron';
import type { Session } from 'electron';
import { logger } from '../../shared/logger';

// Sesja podglądu playerów (inline `<webview>` i osobne okno). Osobna partycja daje
// izolację: spoof nagłówków i UA dotyczą TYLKO podglądu, nie całej aplikacji.
export const PREVIEW_PARTITION = 'persist:onda-preview';

let headersConfigured = false;

export function previewSession(): Session {
  return session.fromPartition(PREVIEW_PARTITION);
}

/**
 * Kontekst izolowanej sesji podglądu. Nie podmieniamy `Referer`/`Origin` — player
 * ładuje się jako dokument top-level w `<webview>` (jego własna domena), więc
 *  referer jest naturalny. Wcześniejszy spoof psuł odtwarzacz CDA (P1036), bo
 *  ustawiał referer podzasobów na origin samego zasobu zamiast `www.cda.pl`.
 *  Ustawiamy tylko desktopowy UA (bez tokenu Electron).
 */
/** Desktopowy UA (bez tokenu Electron), bo część playerów blokuje Electrona. */
export function previewUserAgent(): string {
  const chromeMajor = (process.versions.chrome || '120').split('.')[0];
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor} Safari/537.36`;
}

/** Konfiguruje sesję podglądu (idempotentnie): desktopowy UA. */
export function configurePreviewSession(): Session {
  const ses = previewSession();
  if (!headersConfigured) {
    headersConfigured = true;
    try {
      ses.setUserAgent(previewUserAgent());
    } catch (e) {
      logger.warn('preview', 'setUserAgent failed', e);
    }
  }
  return ses;
}

let webviewGuardInstalled = false;

/**
 * Globalny guard `<webview>`: wymusza bezpieczne preferencje (bez preloadu/Node,
 * sandbox, contextIsolation) i dopuszcza wyłącznie partycję podglądu. Dzięki temu
 * osadzenie playera inline w modalu ma tę samą izolację co osobne okno podglądu.
 */
export function installWebviewGuard(): void {
  if (webviewGuardInstalled) return;
  webviewGuardInstalled = true;
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      if (params.partition && params.partition !== PREVIEW_PARTITION) {
        event.preventDefault();
      }
    });
  });
}
