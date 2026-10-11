import { ipcMain, shell } from 'electron';
import { configurePreviewSession, installWebviewGuard } from './preview-session';
import { installPreviewAdblock, setPreviewAdblock } from './adblock';
import { logger } from '../../shared/logger';

// Handlery sesji podglądu: guard `<webview>`, ad-blocker i otwieranie linków na
// zewnątrz. Osobne okno podglądu (i przycisk „Otwórz w oknie podglądu") usunięto
// jako niepotrzebne — osadzenia działają inline w modalu/playerze.

function isHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url;
  } catch {
    // nieprawidłowy URL
  }
  return null;
}

export function registerPreviewHandlers(): void {
  // Guard `<webview>` obejmuje też osadzenia inline w głównym oknie (modal playera).
  installWebviewGuard();
  // Własny ad-blocker dla sesji podglądu (tylko osadzone playery Źródeł).
  installPreviewAdblock();

  // Włącz/wyłącz ad-blocker podglądu (stan trzyma ustawienie `appearance.previewAdblock`).
  ipcMain.handle('preview:setAdblock', (_event, on: unknown) => {
    setPreviewAdblock(on === true);
    return on === true;
  });

  // Wołane przez osadzenie inline PRZED utworzeniem `<webview>`: konfiguruje sesję
  // podglądu (UA), aby pierwsze żądania były już poprawnie nagłówkowane.
  ipcMain.handle('preview:prepare', () => {
    configurePreviewSession();
    return { success: true };
  });

  ipcMain.handle('preview:openExternal', (_event, url: unknown): void => {
    if (typeof url !== 'string') return;
    const parsed = isHttpUrl(url);
    if (!parsed) return;
    try {
      void shell.openExternal(parsed.href);
    } catch (e) {
      logger.warn('preview', 'openExternal failed', e);
    }
  });
}
