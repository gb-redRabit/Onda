import { BrowserWindow } from 'electron';
import { join } from 'path';
import { computePipPosition } from './pip-position';
import { createWindow } from '../windows/window-factory';
import { pipWindowIcon } from './pip-icon';

export class PipPreview {
  private window: BrowserWindow | null = null;
  private theme: Record<string, string> = {};
  private locale = 'en';
  private onClosed: (() => void) | null = null;

  setClosedHandler(handler: (() => void) | null): void {
    this.onClosed = handler;
  }

  show(
    opts: { position?: string; width?: number; height?: number },
    initial: { theme?: Record<string, string>; locale?: string } = {}
  ): boolean {
    this.hide();
    if (initial.theme) this.theme = initial.theme;
    if (initial.locale) this.locale = initial.locale;
    const pw = opts.width || 480;
    const ph = opts.height || 290;
    const bounds = computePipPosition({ position: opts.position, width: pw, height: ph });

    this.window = createWindow({
      x: bounds.x,
      y: bounds.y,
      width: pw,
      height: ph,
      show: false,
      alwaysOnTop: true,
      frame: false,
      hasShadow: false,
      skipTaskbar: true,
      resizable: true,
      transparent: true,
      backgroundColor: '#00000000',
      icon: pipWindowIcon(),
      webPreferences: { preload: join(__dirname, '../preload/pip.js') },
      htmlFile: 'pip.html',
      hash: 'preview',
      autoShow: false,
      onReadyToShow: () => this.window?.show(),
      onClosed: () => {
        this.window = null;
        this.onClosed?.();
      }
    });

    this.window.setMenuBarVisibility(false);

    this.window.webContents.on('did-finish-load', () => {
      if (!this.window || this.window.isDestroyed()) return;
      this.window.webContents.send('pip:theme', this.theme);
      this.window.webContents.send('pip:locale', this.locale);
    });

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

  updateTheme(vars: Record<string, string>): void {
    this.theme = vars;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('pip:theme', vars);
    }
  }

  updateLocale(locale: string): void {
    this.locale = locale || 'en';
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('pip:locale', this.locale);
    }
  }

  owns(sender: Electron.WebContents): boolean {
    return !!this.window && !this.window.isDestroyed() && this.window.webContents.id === sender.id;
  }

  destroy(): void {
    this.hide();
  }
}
