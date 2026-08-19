import { BrowserWindow, screen } from 'electron';
import { computePipPosition } from './pip-position';
import { installNavigationGuard } from './navigation-guard';
import { pipWindowIcon } from './pip-icon';
import type { PipMode, PipPosition } from '../shared/types/pip';

// A lightweight always-on-top placeholder window that visually mirrors the
// audio PiP size, position and opacity, so users can preview their settings.
export class AudioPipPreview {
  private window: BrowserWindow | null = null;
  private mode: PipMode = 'minimal';
  private position: PipPosition = 'bottom-right';
  private opacity = 0.35;

  show(opts: { mode?: string; position?: string; opacity?: number }): boolean {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;

    this.mode = (opts.mode as PipMode) || 'minimal';
    this.position = (opts.position as PipPosition) || 'bottom-right';
    this.opacity = typeof opts.opacity === 'number' ? opts.opacity : 0.35;

    const size = this.getModeSize();
    const bounds = computePipPosition({
      position: this.resolvePosition(),
      width: size.width,
      height: size.height
    });

    this.window = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: size.width,
      height: size.height,
      show: false,
      alwaysOnTop: true,
      frame: false,
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      transparent: true,
      backgroundColor: '#00000000',
      icon: pipWindowIcon(),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const alpha = Math.max(0.15, Math.min(0.9, this.opacity)).toFixed(2);
    const radius = size.height < 60 ? '10px' : '16px';
    const fontSize = size.height < 60 ? '11px' : '13px';
    const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;background:transparent;height:100vh;overflow:hidden}.bar{width:100%;height:100%;box-sizing:border-box;border:1px dashed rgb(124,106,239);border-radius:${radius};background:rgba(124,106,239,${alpha});display:flex;align-items:center;justify-content:center;gap:6px;color:rgb(255,255,255);font:${fontSize} sans-serif}</style></head><body><div class="bar">Audio PiP</div></body></html>`;
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

  update(opts: { mode?: string; position?: string; opacity?: number }): void {
    if (!this.window || this.window.isDestroyed()) return;

    if (opts.mode) this.mode = opts.mode as PipMode;
    if (opts.position) this.position = opts.position as PipPosition;
    if (typeof opts.opacity === 'number') this.opacity = opts.opacity;

    const size = this.getModeSize();
    this.window.setBounds(
      computePipPosition({
        position: this.resolvePosition(),
        width: size.width,
        height: size.height
      })
    );

    const alpha = Math.max(0.15, Math.min(0.9, this.opacity)).toFixed(2);
    this.window.webContents
      .executeJavaScript(
        `document.querySelector('.bar').style.background='rgba(124,106,239,${alpha})'`
      )
      .catch(() => {});
  }

  isShowing(): boolean {
    return !!this.window && !this.window.isDestroyed();
  }

  destroy(): void {
    this.hide();
  }

  private getModeSize(): { width: number; height: number } {
    const wa = screen.getPrimaryDisplay().workAreaSize;
    const w = wa && Number.isFinite(wa.width) ? wa.width : 1280;
    switch (this.mode) {
      case 'medium':
        return { width: 400, height: 100 };
      case 'max':
        return { width: w, height: 100 };
      case 'wide':
        return { width: w, height: 36 };
      default:
        return { width: 280, height: 36 };
    }
  }

  private resolvePosition(): PipPosition {
    let pos: PipPosition = this.position;
    if (this.mode === 'max' || this.mode === 'wide') {
      if (pos.includes('-')) pos = pos.startsWith('top') ? 'top' : 'bottom';
    }
    return pos;
  }
}
