import { BrowserWindow } from 'electron';
import { computePipPosition } from './pip-position';
import { installNavigationGuard } from './navigation-guard';

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
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const radius = ph < 120 ? '12px' : '16px';
    const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0}body{background:transparent;height:100vh;overflow:hidden}.box{width:100%;height:100%;box-sizing:border-box;border:1px dashed rgb(124,106,239);border-radius:${radius};background:rgba(124,106,239,0.35);display:flex;align-items:center;justify-content:center;color:rgb(255,255,255);font:13px sans-serif}</style></head><body><div class="box">Video PiP</div></body></html>`;
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    installNavigationGuard(this.window, { allowData: true });

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
