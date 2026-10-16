import { dirname } from 'path';
import type { BrowserWindow } from 'electron';

/**
 * Pliki przekazane Onda przez OS (skojarzenie plików, "Otwórz za pomocą",
 * wiersz poleceń). Mogą dotrzeć, zanim renderer zamontuje swoje listenery IPC,
 * więc ścieżki są przetrzymywane, dopóki renderer nie pobierze ich przez
 * `app:getPendingFiles`.
 *
 * `grantRoot` jest wstrzykiwane, aby zależność od media-server nie trafiała do
 * tego modułu (i aby pozostał testowalny jednostkowo).
 */
export class OpenFileForwarder {
  private pending: string[] = [];
  // Czy renderer zarejestrował już listener i pobrał pliki (`app:getPendingFiles`).
  // Dopóki false, zdarzenia są BUFOROWANE — wcześniej trafiały jednocześnie do
  // `pending` i przez `send`, więc były dostarczane dwa razy, a po przeładowaniu
  // renderera `app:getPendingFiles` odtwarzał stare pliki i pamięć rosła.
  private rendererListening = false;

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly grantRoot: (dir: string) => void
  ) {}

  focus(): void {
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  forward(paths: string[]): void {
    if (paths.length) {
      // Przyznaje media serverowi dostęp do katalogów plików otwartych z OS.
      for (const p of paths) this.grantRoot(dirname(p));
    }
    this.focus();
    if (!paths.length) return;
    const win = this.getMainWindow();
    if (this.rendererListening && win && !win.isDestroyed() && !win.webContents.isLoading()) {
      win.webContents.send('open-files', paths);
    } else {
      // Renderer jeszcze nie słucha (start/restart) — przetrzymaj do `takePending`.
      this.pending.push(...paths);
    }
  }

  /** Renderer pobrał pliki — od teraz zdarzenia lecą bezpośrednio, a bufor wraca do niego. */
  takePending(): string[] {
    this.rendererListening = true;
    const files = this.pending;
    this.pending = [];
    return files;
  }

  /** Renderer zaczyna się przeładowywać — wróć do buforowania, aż znów pobierze pending. */
  resetListening(): void {
    this.rendererListening = false;
  }
}
