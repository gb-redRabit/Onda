import { BrowserWindow, screen, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { AudioPipState, PipMode, PipPosition } from '../shared/types/pip';
import { computePipPosition } from './pip-position';
import { AudioPipPreview } from './audio-pip-preview';

export class AudioPipManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private mainWindow: BrowserWindow | null = null;
  private mode: PipMode = 'minimal';
  private position: PipPosition = 'bottom-right';
  private opacity = 0.35;
  private preview = new AudioPipPreview();
  private cssVars: Record<string, string> = {};
  private currentState: AudioPipState = {
    trackName: '',
    artist: '',
    coverData: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1
  };

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  init(): void {
    this.registerIpc();
  }

  setMode(mode: PipMode): void {
    this.mode = mode;
  }

  setPosition(pos: PipPosition): void {
    this.position = pos;
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.positionWindow();
    }
  }

  setTheme(vars: Record<string, string>): void {
    this.cssVars = vars;
    if (this.window && !this.window.isDestroyed() && this.window.isVisible() && this.ready) {
      this.window.webContents.send('audio-pip:theme', vars);
    }
  }

  setOpacity(val: number): void {
    this.opacity = val;
    if (this.window && !this.window.isDestroyed() && this.window.isVisible() && this.ready) {
      this.window.webContents.send('audio-pip:update', { opacity: val });
    }
  }

  show(state: AudioPipState, mode?: PipMode, opacity?: number, position?: PipPosition): void {
    if (mode) this.mode = mode;
    if (opacity !== undefined) this.opacity = opacity;
    if (position) this.position = position;
    Object.assign(this.currentState, state);
    this.ensureWindow();
    this.positionWindow();
    this.window?.show();
    this.window?.focus();
    this.updateUi();
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  update(state: Partial<AudioPipState>): void {
    Object.assign(this.currentState, state);
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.updateUi();
    }
  }

  stop(): void {
    this.hide();
    this.currentState = {
      trackName: '',
      artist: '',
      coverData: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1
    };
  }

  showPreview(opts: { mode?: string; position?: string; opacity?: number }): boolean {
    return this.preview.show(opts);
  }

  hidePreview(): void {
    this.preview.hide();
  }

  updatePreview(opts: { mode?: string; position?: string; opacity?: number }): void {
    this.preview.update(opts);
  }

  isPreviewShowing(): boolean {
    return this.preview.isShowing();
  }

  private ensureWindow(): BrowserWindow {
    if (!this.window || this.window.isDestroyed()) {
      this.ready = false;
      this.createWindow();
    }
    return this.window!;
  }

  private createWindow(): void {
    const winSize = this.getModeSize();

    this.window = new BrowserWindow({
      width: winSize.width,
      height: winSize.height,
      show: false,
      alwaysOnTop: true,
      frame: false,
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/audio-pip.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });

    this.window.on('closed', () => {
      this.window = null;
      this.ready = false;
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/audio-pip.html`);
    } else {
      this.window.loadFile(join(__dirname, '../renderer/audio-pip.html'));
    }

    this.window.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.currentState.trackName) {
        this.updateUi();
      }
    });
  }

  private getModeSize(): { width: number; height: number } {
    switch (this.mode) {
      case 'medium':
        return { width: 400, height: 100 };
      case 'max': {
        const display = screen.getPrimaryDisplay().workAreaSize;
        return { width: display.width, height: 100 };
      }
      case 'wide': {
        const display = screen.getPrimaryDisplay().workAreaSize;
        return { width: display.width, height: 36 };
      }
      default:
        return { width: 280, height: 36 };
    }
  }

  private positionWindow(): void {
    if (!this.window || this.window.isDestroyed()) return;

    const winSize = this.getModeSize();
    let pos: PipPosition = this.position;
    if (this.mode === 'max' || this.mode === 'wide') {
      if (pos.includes('-')) pos = pos.startsWith('top') ? 'top' : 'bottom';
    }
    this.window.setBounds(computePipPosition({ position: pos, ...winSize }));
  }

  private updateUi(): void {
    if (!this.window || this.window.isDestroyed() || !this.ready) {
      return;
    }
    this.window.webContents.send('audio-pip:update', {
      mode: this.mode,
      state: this.currentState,
      opacity: this.opacity,
      cssVars: this.cssVars
    });
  }

  private registerIpc(): void {
    ipcMain.on('audio-pip:hidden', () => {
      this.hide();
      this.mainWindow?.webContents.send('audio-pip:closed');
    });

    ipcMain.on('audio-pip:showMain', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.show();
        this.mainWindow.moveTop();
        this.mainWindow.focus();
      }
    });

    ipcMain.on('audio-pip:action', (_event, action: string) => {
      this.mainWindow?.webContents.send('audio-pip:action', action);
    });

    ipcMain.on('audio-pip:progressClick', (_event, percent: number) => {
      this.mainWindow?.webContents.send('audio-pip:progressClick', percent);
    });

    ipcMain.on('audio-pip:theme', (_event, vars: Record<string, string>) => {
      this.setTheme(vars);
    });

    ipcMain.on('audio-pip:timeUpdate', (_event, state: AudioPipState) => {
      Object.assign(this.currentState, state);
      if (this.window && !this.window.isDestroyed() && this.window.isVisible() && this.ready) {
        this.window.webContents.send('audio-pip:update', {
          mode: this.mode,
          state: this.currentState,
          opacity: this.opacity
        });
      }
    });

    ipcMain.on('audio-pip:vizData', (_event, data: number[]) => {
      if (this.window && !this.window.isDestroyed() && this.window.isVisible() && this.ready) {
        this.window.webContents.send('audio-pip:vizData', data);
      }
    });
  }

  isShowing(): boolean {
    return !!this.window && !this.window.isDestroyed() && this.window.isVisible();
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.ready = false;
    this.preview.destroy();
    ipcMain.removeAllListeners('audio-pip:hidden');
    ipcMain.removeAllListeners('audio-pip:showMain');
    ipcMain.removeAllListeners('audio-pip:action');
    ipcMain.removeAllListeners('audio-pip:progressClick');
    ipcMain.removeAllListeners('audio-pip:timeUpdate');
    ipcMain.removeAllListeners('audio-pip:vizData');
    ipcMain.removeAllListeners('audio-pip:theme');
  }
}

export const audioPipManager = new AudioPipManager();
