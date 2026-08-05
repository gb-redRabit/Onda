import { BrowserWindow } from 'electron';
import { computePipPosition } from './pip-position';

export class PipPreview {
  private window: BrowserWindow | null = null;

  show(opts: { position?: string; width?: number; height?: number }): boolean {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;

    const pw = opts.width || 480;
    const ph = opts.height || 290;
    const bounds = computePipPosition({ position: opts.position, width: pw, height: ph });

    this.window = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: pw,
      height: ph,
      show: false,
      alwaysOnTop: true,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      backgroundColor: '#1a1a1a',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.window.loadURL(
      `data:text/html,<!DOCTYPE html><html><head><style>*{margin:0;padding:0}body{background:#1a1a1a;height:100vh;display:flex;align-items:center;justify-content:center;color:#555;font:13px sans-serif;border:1px dashed #333;border-radius:12px;box-sizing:border-box}</style></head><body>Podgląd PiP</body></html>`
    );

    this.window.on('closed', () => {
      this.window = null;
    });

    this.window.show();
    return true;
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  update(opts: { position?: string; width?: number; height?: number }): void {
    if (!this.window || this.window.isDestroyed()) return;

    const size = this.window.getSize();
    const pw = opts.width ?? size[0] ?? 400;
    const ph = opts.height ?? size[1] ?? 300;
    this.window.setBounds(computePipPosition({ position: opts.position, width: pw, height: ph }));
  }

  destroy(): void {
    this.hide();
  }
}
