import { BrowserWindow } from 'electron';

/**
 * Wysyła zdarzenie do renderera okna, tolerując okna nieobecne, zniszczone lub
 * w trakcie rozbierania (quit / restart / reset fabryczny). Zwraca, czy wiadomość
 * faktycznie została dostarczona.
 */
export function sendToWindow(
  win: BrowserWindow | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false;
  try {
    win.webContents.send(channel, ...args);
    return true;
  } catch {
    // renderer zniknął między strażnikiem a wysłaniem — nie ma nic do zrobienia
    return false;
  }
}

// Wysyła payload zdarzenia do każdego otwartego okna. Używane do push'y statusu
// sterowanych z procesu głównego (postęp pobierania, aktualizacje subskrypcji, odświeżenie biblioteki itp.).
export function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    sendToWindow(win, channel, ...args);
  }
}
