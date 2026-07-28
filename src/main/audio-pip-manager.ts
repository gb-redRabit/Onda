import { BrowserWindow, screen, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';


type PipMode = 'minimal' | 'medium' | 'max';
type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

interface AudioPipState {
  trackName: string;
  artist: string;
  coverData: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted?: boolean;
  equalizerBands?: number[];
  nextTrackName?: string;
  nextTrackArtist?: string;
}

export class AudioPipManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private mainWindow: BrowserWindow | null = null;
  private mode: PipMode = 'minimal';
  private position: PipPosition = 'bottom-right';
  private opacity = 0.35;
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
      trackName: '', artist: '', coverData: null,
      isPlaying: false, currentTime: 0, duration: 0, volume: 1
    };
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
      case 'medium': return { width: 400, height: 120 };
      case 'max': {
        const display = screen.getPrimaryDisplay().workAreaSize;
        return { width: display.width, height: Math.round(display.height / 10) };
      }
      default: return { width: 280, height: 40 };
    }
  }

  private positionWindow(): void {
    if (!this.window || this.window.isDestroyed()) return;

    const winSize = this.getModeSize();
    const display = screen.getPrimaryDisplay().workAreaSize;
    const margin = 20;

    let x: number, y: number;

    if (this.mode === 'max') {
      x = 0;
      y = 0;
    } else {
      switch (this.position) {
        case 'bottom-right':
          x = display.width - winSize.width - margin;
          y = display.height - winSize.height - margin;
          break;
        case 'bottom-left':
          x = margin;
          y = display.height - winSize.height - margin;
          break;
        case 'top-right':
          x = display.width - winSize.width - margin;
          y = margin;
          break;
        case 'top-left':
          x = margin;
          y = margin;
          break;
      }
    }
    this.window.setBounds({ x, y, width: winSize.width, height: winSize.height });
  }

  private updateUi(): void {
    if (!this.window || this.window.isDestroyed() || !this.ready) {
      return;
    }
    this.window.webContents.send('audio-pip:update', {
      mode: this.mode,
      state: this.currentState,
      opacity: this.opacity
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
        this.mainWindow.focus();
      }
    });

    ipcMain.on('audio-pip:action', (_event, action: string) => {
      this.mainWindow?.webContents.send('audio-pip:action', action);
    });

    ipcMain.on('audio-pip:progressClick', (_event, percent: number) => {
      this.mainWindow?.webContents.send('audio-pip:progressClick', percent);
    });

    ipcMain.on('audio-pip:timeUpdate', (_event, state: AudioPipState) => {
      this.currentState.currentTime = state.currentTime;
      this.currentState.isPlaying = state.isPlaying;
      if (this.window && !this.window.isDestroyed() && this.window.isVisible() && this.ready) {
        this.window.webContents.send('audio-pip:update', {
          mode: this.mode,
          state: this.currentState,
          opacity: this.opacity
        });
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
    ipcMain.removeAllListeners('audio-pip:hidden');
    ipcMain.removeAllListeners('audio-pip:showMain');
    ipcMain.removeAllListeners('audio-pip:action');
    ipcMain.removeAllListeners('audio-pip:progressClick');
    ipcMain.removeAllListeners('audio-pip:timeUpdate');
  }
}

export const audioPipManager = new AudioPipManager();
