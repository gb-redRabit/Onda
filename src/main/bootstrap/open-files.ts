import { dirname } from 'path';
import type { BrowserWindow } from 'electron';

/**
 * Files handed to Onda by the OS (file association, "Open with", command line).
 * They can arrive before the renderer has mounted its IPC listeners, so paths
 * are held until the renderer pulls them via `app:getPendingFiles`.
 *
 * `grantRoot` is injected so the media-server dependency stays out of this
 * module (and it stays unit-testable).
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
      // Grant the media server access to the folders of files opened from the OS.
      for (const p of paths) this.grantRoot(dirname(p));
      this.pending.push(...paths);
    }
    this.focus();
    const win = this.getMainWindow();
    if (!paths.length || !win || win.webContents.isLoading()) return;
    win.webContents.send('open-files', paths);
  }

  /** Returns the held paths and clears them (renderer pulled them). */
  takePending(): string[] {
    const files = this.pending;
    this.pending = [];
    return files;
  }
}
