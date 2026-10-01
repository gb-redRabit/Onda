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
      this.pending.push(...paths);
    }
    this.focus();
    const win = this.getMainWindow();
    if (!paths.length || !win || win.webContents.isLoading()) return;
    win.webContents.send('open-files', paths);
  }

  /** Zwraca przetrzymywane ścieżki i je czyści (renderer je pobrał). */
  takePending(): string[] {
    const files = this.pending;
    this.pending = [];
    return files;
  }
}
