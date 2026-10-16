import { ipcMain } from 'electron';
import { configurePreviewSession, installWebviewGuard } from './preview-session';
import { installPreviewAdblock, setPreviewAdblock } from './adblock';

// Handlery sesji podglądu: guard `<webview>` i ad-blocker. Osobne okno podglądu
// (i przycisk „Otwórz w oknie podglądu") usunięto jako niepotrzebne — osadzenia
// działają inline w modalu/playerze.

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
}
