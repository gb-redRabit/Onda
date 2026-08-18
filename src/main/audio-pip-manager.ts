import { BrowserWindow, screen, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { AudioPipState, PipMode, PipPosition } from '../shared/types/pip';
import { computePipPosition } from './pip-position';
import { AudioPipPreview } from './audio-pip-preview';
import { installNavigationGuard } from './navigation-guard';

export class AudioPipManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private mainWindow: BrowserWindow | null = null;
  private mode: PipMode = 'minimal';
  private position: PipPosition = 'bottom-right';
  private opacity = 0.35;
  private preview = new AudioPipPreview();
  private pipFocusedAt = 0;
  private peeked = false;
  private readonly sliver = 2;
  private mouseInside = false;
  private peekDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private cssVars: Record<string, string> = {};
  private displayBoundsCache = new Map<number, { x: number; y: number; width: number; height: number }>();
  private currentState: AudioPipState = {
    trackName: '',
    artist: '',
    coverData: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1
  };

  private onDisplayMetricsChanged = (_event: unknown, display?: Electron.Display): void => {
    if (display?.bounds) {
      const b = display.bounds;
      const prev = this.displayBoundsCache.get(display.id);
      if (
        prev &&
        Math.abs(prev.x - b.x) < 1 &&
        Math.abs(prev.y - b.y) < 1 &&
        Math.abs(prev.width - b.width) < 1 &&
        Math.abs(prev.height - b.height) < 1
      ) {
        return;
      }
      this.displayBoundsCache.set(display.id, {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height
      });
    }
    this.repositionForDisplayChange();
  };

  private repositionForDisplayChange = (): void => {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.cancelPeekTimers();
      this.positionWindow();
    }
  };

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
    win.on('focus', () => {
      if (Date.now() - this.pipFocusedAt > 2000) this.autoHide();
    });
  }

  init(): void {
    this.registerIpc();
    screen.on('display-metrics-changed', this.onDisplayMetricsChanged);
    screen.on('display-added', this.repositionForDisplayChange);
    screen.on('display-removed', this.repositionForDisplayChange);
  }

  setMode(mode: PipMode): void {
    this.setModePosition(mode, undefined);
  }

  setPosition(pos: PipPosition): void {
    this.setModePosition(undefined, pos);
  }

  setModePosition(mode?: PipMode, position?: PipPosition): void {
    const modeChanged = mode !== undefined && mode !== this.mode;
    const posChanged = position !== undefined && position !== this.position;
    if (modeChanged) {
      this.mode = mode;
      this.cancelPeekTimers();
      this.peeked = false;
    }
    if (posChanged) this.position = position;
    if (!modeChanged && !posChanged) return;
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.positionWindow();
      this.updateUi(false);
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
    if (mode && mode !== this.mode) this.mode = mode;
    if (opacity !== undefined) this.opacity = opacity;
    if (position && position !== this.position) this.position = position;
    Object.assign(this.currentState, state);
    this.cancelPeekTimers();
    this.peeked = false;
    this.mouseInside = false;
    this.ensureWindow();
    if (!(this.window?.isVisible() ?? false)) {
      this.positionWindow();
    }
    this.window?.showInactive();
    this.window?.setAlwaysOnTop(true, 'screen-saver');
    this.schedulePeek();
    this.updateUi();
  }

  hide(): void {
    this.mouseInside = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  autoHide(): void {
    this.hide();
  }

  peek(): void {
    if (this.mode !== 'wide' || this.peeked || this.mouseInside) return;
    const win = this.window;
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    this.peeked = true;
    this.cancelPeekDelay();
    this.setWindowY(this.getWideY(true));
    this.updateUi(false);
  }

  unpeek(): void {
    if (this.mode !== 'wide' || !this.peeked) return;
    const win = this.window;
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    this.peeked = false;
    this.cancelPeekDelay();
    this.setWindowY(this.getWideY(false));
    this.updateUi(false);
  }

  private schedulePeek(): void {
    if (this.peekDelayTimer || this.mode !== 'wide' || this.peeked) return;
    this.peekDelayTimer = setTimeout(() => {
      this.peekDelayTimer = null;
      this.peek();
    }, 700);
  }

  private cancelPeekDelay(): void {
    if (this.peekDelayTimer) {
      clearTimeout(this.peekDelayTimer);
      this.peekDelayTimer = null;
    }
  }

  private cancelPeekTimers(): void {
    this.cancelPeekDelay();
  }

  private setWindowY(targetY: number): void {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    try {
      const size = this.getModeSize();
      const [x] = win.getPosition();
      win.setBounds({
        x: Math.round(x),
        y: Math.round(targetY),
        width: size.width,
        height: size.height
      });
    } catch (e) {
      console.error('audio-pip reposition failed', e);
    }
  }

  private getWideY(peeked: boolean): number {
    const workArea = this.getDisplay().workArea;
    if (!workArea || !Number.isFinite(workArea.y) || !Number.isFinite(workArea.height)) {
      return workArea?.y ?? 0;
    }
    const h =
      this.window && !this.window.isDestroyed()
        ? this.window.getBounds().height
        : this.getModeSize().height;
    const isTop = this.position.startsWith('top');
    if (isTop) {
      return peeked ? Math.round(workArea.y - (h - this.sliver)) : Math.round(workArea.y);
    }
    return peeked
      ? Math.round(workArea.y + workArea.height - this.sliver)
      : Math.round(workArea.y + workArea.height - h);
  }

  update(state: Partial<AudioPipState>): void {
    Object.assign(this.currentState, state);
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.updateUi();
    }
  }

  stop(): void {
    this.hide();
    this.cancelPeekTimers();
    this.peeked = false;
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

    this.window.setAlwaysOnTop(true, 'screen-saver');

    this.window.on('closed', () => {
      this.window = null;
      this.ready = false;
      this.cancelPeekTimers();
      this.peeked = false;
      this.mainWindow?.webContents.send('audio-pip:closed');
    });

    installNavigationGuard(this.window);

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/audio-pip.html`);
    } else {
      this.window.loadFile(join(__dirname, '../renderer/audio-pip.html'));
    }

    this.window.webContents.on('did-finish-load', () => {
      this.ready = true;
      this.updateUi();
    });
  }

  private getDisplay(): Electron.Display {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const bounds = this.mainWindow.getBounds();
      if (bounds.width > 0 && bounds.height > 0) {
        try {
          return screen.getDisplayMatching(bounds);
        } catch {
          // fall through to primary display
        }
      }
    }
    return screen.getPrimaryDisplay();
  }

  private getModeSize(): { width: number; height: number } {
    const wa = this.getDisplay().workAreaSize;
    const w = wa && Number.isFinite(wa.width) && wa.width > 0 ? wa.width : 1280;
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

  private getEdge(): 'top' | 'bottom' | null {
    if (this.mode !== 'max' && this.mode !== 'wide') return null;
    return this.position.startsWith('top') ? 'top' : 'bottom';
  }

  private positionWindow(): void {
    if (!this.window || this.window.isDestroyed()) return;

    const winSize = this.getModeSize();
    const workArea = this.getDisplay().workArea;

    if (this.mode === 'wide') {
      if (workArea && Number.isFinite(workArea.x) && Number.isFinite(workArea.y)) {
        this.window.setBounds({
          x: Math.round(workArea.x),
          y: this.getWideY(this.peeked),
          width: winSize.width,
          height: winSize.height
        });
      }
      return;
    }

    let pos: PipPosition = this.position;
    if (this.mode === 'max') {
      if (pos.includes('-')) pos = pos.startsWith('top') ? 'top' : 'bottom';
    }
    this.window.setBounds(
      computePipPosition({ position: pos, ...winSize, workArea })
    );
  }

  private updateUi(includeState = true): void {
    if (!this.window || this.window.isDestroyed() || !this.ready) {
      return;
    }
    const payload: {
      mode: PipMode;
      edge: 'top' | 'bottom' | null;
      peeked: boolean;
      state?: AudioPipState;
      opacity: number;
      cssVars: Record<string, string>;
    } = {
      mode: this.mode,
      edge: this.getEdge(),
      peeked: this.peeked,
      opacity: this.opacity,
      cssVars: this.cssVars
    };
    if (includeState) payload.state = this.currentState;
    this.window.webContents.send('audio-pip:update', payload);
  }

  private registerIpc(): void {
    ipcMain.on('audio-pip:showMain', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.show();
        this.mainWindow.moveTop();
        this.mainWindow.focus();
      }
    });

    ipcMain.on('audio-pip:action', (_event, action: string) => {
      this.pipFocusedAt = Date.now();
      this.mainWindow?.webContents.send('audio-pip:action', action);
    });

    ipcMain.on('audio-pip:progressClick', (_event, percent: number) => {
      this.pipFocusedAt = Date.now();
      this.mainWindow?.webContents.send('audio-pip:progressClick', percent);
    });

    ipcMain.on('audio-pip:unpeek', () => {
      this.mouseInside = true;
      this.unpeek();
    });

    ipcMain.on('audio-pip:peekDelay', () => {
      this.mouseInside = false;
      this.schedulePeek();
    });

    ipcMain.on('audio-pip:theme', (_event, vars: Record<string, string>) => {
      this.setTheme(vars);
    });

    ipcMain.on('audio-pip:timeUpdate', (_event, state: AudioPipState) => {
      Object.assign(this.currentState, state);
      if (this.window && !this.window.isDestroyed() && this.window.isVisible() && this.ready) {
        this.window.webContents.send('audio-pip:update', {
          mode: this.mode,
          edge: this.getEdge(),
          peeked: this.peeked,
          state: this.currentState,
          opacity: this.opacity,
          cssVars: this.cssVars
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
    this.cancelPeekTimers();
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.ready = false;
    this.preview.destroy();
    screen.removeListener('display-metrics-changed', this.onDisplayMetricsChanged);
    screen.removeListener('display-added', this.repositionForDisplayChange);
    screen.removeListener('display-removed', this.repositionForDisplayChange);
    ipcMain.removeAllListeners('audio-pip:showMain');
    ipcMain.removeAllListeners('audio-pip:action');
    ipcMain.removeAllListeners('audio-pip:progressClick');
    ipcMain.removeAllListeners('audio-pip:unpeek');
    ipcMain.removeAllListeners('audio-pip:peekDelay');
    ipcMain.removeAllListeners('audio-pip:timeUpdate');
    ipcMain.removeAllListeners('audio-pip:vizData');
    ipcMain.removeAllListeners('audio-pip:theme');
  }
}

export const audioPipManager = new AudioPipManager();
