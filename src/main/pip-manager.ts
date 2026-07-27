import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { PipPreview } from './pip-preview';

interface PipSubtitleData {
  subContent: string;
  fonts: Array<{ name: string; data: number[] }>;
  availableFonts: Record<string, string>;
}

interface PipShowOptions {
  src: string;
  startTime?: number;
  position?: string;
  width?: number;
  height?: number;
  subtitle?: PipSubtitleData | null;
}

interface PendingData {
  src: string;
  subtitle: PipSubtitleData | null;
  autoPlay: boolean;
  startTime: number;
}

export class PipManager {
  private window: BrowserWindow | null = null;
  private preview: PipPreview = new PipPreview();
  private lastTime = 0;
  private timeTimer: ReturnType<typeof setInterval> | null = null;
  private ready = false;
  private mainWindow: BrowserWindow | null = null;
  private loadedSrc: string | null = null;
  private pendingData: PendingData | null = null;

  private static normalizeFilePath(url: string): string {
    try {
      const decoded = decodeURIComponent(url);
      const ondaMatch = decoded.match(/^onda:\/\/\/?\?path=(.+)/i);
      if (ondaMatch?.[1]) {
        return decodeURIComponent(ondaMatch[1]).replace(/\//g, '\\').toLowerCase();
      }
      const fileMatch = decoded.match(/^file:\/\/\/?(.+)/i);
      return fileMatch?.[1]
        ? fileMatch[1].replace(/\//g, '\\').toLowerCase()
        : decoded.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  init(): void {
    this.createWindow();
    this.registerIpc();
  }

  private createWindow(): void {
    this.window = new BrowserWindow({
      width: 480,
      height: 290,
      minWidth: 180,
      minHeight: 110,
      show: false,
      alwaysOnTop: true,
      frame: false,
      skipTaskbar: true,
      resizable: true,
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });

    this.window.on('closed', () => {
      this.window = null;
      this.ready = false;
      this.loadedSrc = null;
      this.stopTimeTracking();
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/pip.html`);
    } else {
      this.window.loadFile(join(__dirname, '../renderer/pip.html'));
    }

    this.window.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.pendingData) {
        const pd = this.pendingData;
        this.pendingData = null;
        this.sendVideoSrc(pd.src, pd.subtitle, 0);
        if (pd.autoPlay) {
          this.sendPlay(pd.startTime);
          this.startTimeTracking();
        }
      }
    });
  }

  private registerIpc(): void {
    ipcMain.on('pip:hidden', () => {
      this.hide();
      this.notifyClosed();
    });

    ipcMain.on('pip:timeUpdate', (_event, time: number) => {
      this.lastTime = time || 0;
    });

    ipcMain.on('pip:ended', () => {
      this.stopTimeTracking();
      this.loadedSrc = null;
      this.mainWindow?.webContents.send('pip:ended');
    });
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.window.webContents.send(channel, ...args);
  }

  private sendPlay(startTime: number): void {
    this.sendToRenderer('pip:play', startTime);
  }

  private notifyClosed(): void {
    const time = this.lastTime;
    this.mainWindow?.webContents.send('pip:closed', time);
  }

  private startTimeTracking(): void {
    this.stopTimeTracking();
    this.timeTimer = setInterval(() => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('pip:requestTime');
      }
    }, 500);
  }

  private stopTimeTracking(): void {
    if (this.timeTimer) {
      clearInterval(this.timeTimer);
      this.timeTimer = null;
    }
  }

  private ensureWindow(): BrowserWindow {
    if (!this.window || this.window.isDestroyed()) {
      this.ready = false;
      this.loadedSrc = null;
      this.createWindow();
    }
    if (!this.window) {
      throw new Error('PipManager: window creation failed');
    }
    return this.window;
  }

  private positionWindow(opts: { position?: string; width?: number; height?: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const pw = opts.width || 480;
    const ph = opts.height || 290;
    const pos = opts.position || 'bottom-right';
    const display = screen.getPrimaryDisplay().workAreaSize;
    const margin = 20;
    let x: number, y: number;

    switch (pos) {
      case 'bottom-left':
        x = margin;
        y = display.height - ph - margin;
        break;
      case 'top-right':
        x = display.width - pw - margin;
        y = margin;
        break;
      case 'top-left':
        x = margin;
        y = margin;
        break;
      default:
        x = display.width - pw - margin;
        y = display.height - ph - margin;
        break;
    }

    return { x, y, width: pw, height: ph };
  }

  private sendVideoSrc(
    src: string,
    subtitle: PipSubtitleData | null | undefined,
    startTime: number
  ): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.window.webContents.send('pip:videoSrc', { src, start: startTime || 0 });
    this.loadedSrc = src;

    if (subtitle && subtitle.subContent) {
      this.window.webContents.send('pip:subtitle', subtitle);
    } else if (subtitle !== undefined) {
      this.window.webContents.send('pip:clearSubtitle');
    }
  }

  preload(src: string, subtitleData: PipSubtitleData | null): void {
    this.ensureWindow();

    if (this.ready) {
      this.sendVideoSrc(src, subtitleData, 0);
    } else {
      this.pendingData = { src, subtitle: subtitleData, autoPlay: false, startTime: 0 };
    }
  }

  show(options: PipShowOptions): boolean {
    const win = this.ensureWindow();

    const bounds = this.positionWindow(options);
    win.setBounds(bounds);
    win.show();
    win.focus();

    this.lastTime = options.startTime || 0;

    if (this.ready) {
      const loaded = this.loadedSrc ? PipManager.normalizeFilePath(this.loadedSrc) : null;
      const requested = options.src ? PipManager.normalizeFilePath(options.src) : null;
      if (loaded && requested && loaded === requested) {
        this.sendPlay(options.startTime || 0);
        this.startTimeTracking();
      } else {
        this.sendVideoSrc(options.src, options.subtitle, options.startTime || 0);
        this.sendPlay(options.startTime || 0);
        this.startTimeTracking();
      }
    } else {
      this.pendingData = {
        src: options.src,
        subtitle: options.subtitle || null,
        autoPlay: true,
        startTime: options.startTime || 0
      };
    }

    return true;
  }

  loadTrack(src: string, subtitleData: PipSubtitleData | null): void {
    this.ensureWindow();

    if (this.ready) {
      this.lastTime = 0;
      this.sendVideoSrc(src, subtitleData, 0);
      this.sendPlay(0);
      this.startTimeTracking();
    } else {
      this.pendingData = { src, subtitle: subtitleData, autoPlay: true, startTime: 0 };
    }
  }

  play(startTime: number): void {
    this.lastTime = startTime;
    this.sendPlay(startTime);
    this.startTimeTracking();
  }

  hide(): void {
    this.stopTimeTracking();
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('pip:pause');
      this.window.hide();
    }
  }

  stop(): void {
    this.stopTimeTracking();
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('pip:clear');
      this.window.hide();
      this.loadedSrc = null;
    }
    this.notifyClosed();
  }

  updateSubtitle(data: PipSubtitleData | null): void {
    if (!this.window || this.window.isDestroyed()) return;
    if (data && data.subContent) {
      this.window.webContents.send('pip:subtitle', data);
    } else {
      this.window.webContents.send('pip:clearSubtitle');
    }
  }

  getTime(): number {
    return this.lastTime;
  }

  isShowing(): boolean {
    return !!this.window && !this.window.isDestroyed() && this.window.isVisible();
  }

  showPreview(opts: { position?: string; width?: number; height?: number }): boolean {
    return this.preview.show(opts);
  }

  hidePreview(): void {
    this.preview.hide();
  }

  updatePreview(opts: { position?: string; width?: number; height?: number }): void {
    this.preview.update(opts);
  }

  destroy(): void {
    this.stopTimeTracking();
    this.preview.destroy();
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.ready = false;
    this.loadedSrc = null;
    ipcMain.removeAllListeners('pip:hidden');
    ipcMain.removeAllListeners('pip:timeUpdate');
    ipcMain.removeAllListeners('pip:ended');
  }
}

export const pipManager = new PipManager();
