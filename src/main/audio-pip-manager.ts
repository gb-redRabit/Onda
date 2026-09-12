import { BrowserWindow, screen, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { AudioPipState } from '../shared/types/pip';
import {
  type AudioPipDock,
  type AudioPipElementId,
  type AudioPipLayoutKind,
  audioPipLayoutKind,
  getAudioPipSize,
  isAudioPipEdgeDock
} from '../shared/types/pip';
import { computePipPosition } from './pip-position';
import { installNavigationGuard } from './navigation-guard';
import { pipWindowIcon } from './pip-icon';

export interface AudioPipLayoutOpts {
  dock?: AudioPipDock;
  cornerElements?: AudioPipElementId[];
  edgeElements?: AudioPipElementId[];
  autoHide?: boolean;
}

const DEFAULT_CORNER_ELEMENTS: AudioPipElementId[] = [
  'cover',
  'trackInfo',
  'controls',
  'progress',
  'volume'
];
const DEFAULT_EDGE_ELEMENTS: AudioPipElementId[] = [
  'cover',
  'trackInfo',
  'controls',
  'progress',
  'volume',
  'viz'
];

const PREVIEW_STATE: AudioPipState = {
  trackName: 'Podgląd — przykładowy utwór',
  artist: 'Onda',
  coverData: null,
  coverType: null,
  isPlaying: true,
  currentTime: 42,
  duration: 214,
  volume: 0.8,
  isMuted: false,
  shuffle: false,
  repeat: 'none',
  nextTrackName: 'Następny — podgląd',
  nextTrackArtist: 'Onda'
};

export class AudioPipManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private mainWindow: BrowserWindow | null = null;
  private dock: AudioPipDock = 'bottom-right';
  private cornerElements: AudioPipElementId[] = [...DEFAULT_CORNER_ELEMENTS];
  private edgeElements: AudioPipElementId[] = [...DEFAULT_EDGE_ELEMENTS];
  private autoHide = true;
  private isPreview = false;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private cssVars: Record<string, string> = {};
  private displayBoundsCache = new Map<
    number,
    { x: number; y: number; width: number; height: number }
  >();
  private peeked = false;
  private readonly sliver = 5;
  private mouseInside = false;
  private peekDelayTimer: ReturnType<typeof setTimeout> | null = null;
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
      this.displayBoundsCache.set(display.id, { x: b.x, y: b.y, width: b.width, height: b.height });
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
      if (this.isPreview) return;
      this.autoHideNow();
    });
  }

  init(): void {
    this.registerIpc();
    screen.on('display-metrics-changed', this.onDisplayMetricsChanged);
    screen.on('display-added', this.repositionForDisplayChange);
    screen.on('display-removed', this.repositionForDisplayChange);
    // Prewarm: okno ładowane raz w tle, show() jest potem natychmiastowy.
    setImmediate(() => {
      try {
        this.ensureWindow();
      } catch {
        /* lazy fallback w show() */
      }
    });
  }

  /** Jawny prewarm z IPC (np. po starcie apki). */
  prewarm(): void {
    try {
      this.ensureWindow();
    } catch {
      /* noop */
    }
  }

  setLayout(opts: AudioPipLayoutOpts): void {
    let changed = false;
    if (opts.dock && opts.dock !== this.dock) {
      this.dock = opts.dock;
      this.peeked = false;
      this.cancelPeekTimers();
      changed = true;
    }
    if (opts.cornerElements) {
      this.cornerElements = [...opts.cornerElements];
      changed = true;
    }
    if (opts.edgeElements) {
      this.edgeElements = [...opts.edgeElements];
      changed = true;
    }
    if (typeof opts.autoHide === 'boolean' && opts.autoHide !== this.autoHide) {
      this.autoHide = opts.autoHide;
      this.cancelPeekTimers();
      this.peeked = false;
      changed = true;
    }
    if (changed && this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.positionWindow();
      this.updateUi(false);
    }
  }

  setDock(dock: AudioPipDock): void {
    this.setLayout({ dock });
  }

  setTheme(vars: Record<string, string>): void {
    this.cssVars = vars;
    if (this.window && !this.window.isDestroyed() && this.ready) {
      this.window.webContents.send('audio-pip:theme', vars);
    }
  }

  show(state: AudioPipState, opts?: AudioPipLayoutOpts): void {
    if (opts) this.setLayout(opts);
    Object.assign(this.currentState, state);
    this.isPreview = false;
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
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
    this.isPreview = false;
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  autoHideNow(): void {
    if (this.isPreview) return;
    this.hide();
  }

  peek(): void {
    if (!this.shouldAutoHide() || this.peeked || this.mouseInside) return;
    const win = this.window;
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    this.peeked = true;
    this.cancelPeekDelay();
    this.applyPeekBounds();
    this.updateUi(false);
  }

  unpeek(): void {
    if (!this.shouldAutoHide() || !this.peeked) return;
    const win = this.window;
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    this.peeked = false;
    this.cancelPeekDelay();
    this.applyPeekBounds();
    this.updateUi(false);
  }

  private shouldAutoHide(): boolean {
    return this.autoHide && isAudioPipEdgeDock(this.dock) && !this.isPreview;
  }

  private schedulePeek(): void {
    if (this.peekDelayTimer || !this.shouldAutoHide() || this.peeked) return;
    this.peekDelayTimer = setTimeout(() => {
      this.peekDelayTimer = null;
      this.peek();
    }, 900);
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

  private activeElements(): AudioPipElementId[] {
    return isAudioPipEdgeDock(this.dock) ? this.edgeElements : this.cornerElements;
  }

  private layoutKind(): AudioPipLayoutKind {
    return audioPipLayoutKind(this.dock);
  }

  private applyPeekBounds(): void {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    try {
      const size = this.getDockSize();
      const workArea = this.getDisplay().workArea;
      const b = win.getBounds();
      let x = b.x;
      let y = b.y;
      if (this.dock === 'top') {
        x = workArea.x;
        y = this.peeked
          ? Math.round(workArea.y - (size.height - this.sliver))
          : Math.round(workArea.y);
      } else if (this.dock === 'bottom') {
        x = workArea.x;
        y = this.peeked
          ? Math.round(workArea.y + workArea.height - this.sliver)
          : Math.round(workArea.y + workArea.height - size.height);
      } else if (this.dock === 'left') {
        y = workArea.y;
        x = this.peeked
          ? Math.round(workArea.x - (size.width - this.sliver))
          : Math.round(workArea.x);
      } else if (this.dock === 'right') {
        y = workArea.y;
        x = this.peeked
          ? Math.round(workArea.x + workArea.width - this.sliver)
          : Math.round(workArea.x + workArea.width - size.width);
      } else {
        return;
      }
      win.setBounds({ x: Math.round(x), y: Math.round(y), width: size.width, height: size.height });
    } catch (e) {
      console.error('audio-pip reposition failed', e);
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

  showPreview(opts: AudioPipLayoutOpts): boolean {
    if (opts) this.setLayout(opts);
    this.isPreview = true;
    this.cancelPeekTimers();
    this.peeked = false;
    this.mouseInside = false;
    Object.assign(this.currentState, PREVIEW_STATE);
    this.ensureWindow();
    this.positionWindow();
    this.window?.showInactive();
    this.window?.setAlwaysOnTop(true, 'screen-saver');
    this.updateUi();
    return true;
  }

  hidePreview(): void {
    if (!this.isPreview) return;
    this.isPreview = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  updatePreview(opts: AudioPipLayoutOpts): void {
    if (!this.isPreview) return;
    this.setLayout(opts);
    Object.assign(this.currentState, PREVIEW_STATE);
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.positionWindow();
      this.updateUi();
    }
  }

  isPreviewShowing(): boolean {
    return this.isPreview && !!this.window && !this.window.isDestroyed() && this.window.isVisible();
  }

  private ensureWindow(): BrowserWindow {
    if (!this.window || this.window.isDestroyed()) {
      this.ready = false;
      this.createWindow();
    }
    return this.window!;
  }

  private createWindow(): void {
    const winSize = this.getDockSize();

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
      // Systemowy blur tła jak w oknie głównym — sam CSS backdrop-filter
      // w przezroczystym oknie nie ma czego blurrować.
      ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
      ...(process.platform === 'darwin'
        ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
        : {}),
      icon: pipWindowIcon(),
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
      this.isPreview = false;
      this.mainWindow?.webContents.send('audio-pip:closed');
    });

    installNavigationGuard(this.window);

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/audio-pip.html`);
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/audio-pip.html'));
    }

    this.window.webContents.on('did-finish-load', () => {
      this.ready = true;
      // Natychmiast dopychamy theme żeby pierwsze klatki miały kolory apki.
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

  private getDockSize(): { width: number; height: number } {
    const d = this.getDisplay();
    const wa = d.workArea;
    return getAudioPipSize(this.dock, this.activeElements(), {
      width: wa.width,
      height: wa.height
    });
  }

  private getEdge(): 'top' | 'bottom' | 'left' | 'right' | null {
    if (!isAudioPipEdgeDock(this.dock)) return null;
    return this.dock as 'top' | 'bottom' | 'left' | 'right';
  }

  private positionWindow(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const winSize = this.getDockSize();
    const workArea = this.getDisplay().workArea;
    if (isAudioPipEdgeDock(this.dock)) {
      let x = workArea.x;
      let y = workArea.y;
      if (this.dock === 'top') {
        x = workArea.x;
        y = this.peeked
          ? Math.round(workArea.y - (winSize.height - this.sliver))
          : Math.round(workArea.y);
      } else if (this.dock === 'bottom') {
        x = workArea.x;
        y = this.peeked
          ? Math.round(workArea.y + workArea.height - this.sliver)
          : Math.round(workArea.y + workArea.height - winSize.height);
      } else if (this.dock === 'left') {
        x = this.peeked
          ? Math.round(workArea.x - (winSize.width - this.sliver))
          : Math.round(workArea.x);
        y = workArea.y;
      } else {
        x = this.peeked
          ? Math.round(workArea.x + workArea.width - this.sliver)
          : Math.round(workArea.x + workArea.width - winSize.width);
        y = workArea.y;
      }
      this.window.setBounds({ x, y, width: winSize.width, height: winSize.height });
      return;
    }
    this.window.setBounds(computePipPosition({ position: this.dock, ...winSize, workArea }));
  }

  private updateUi(includeState = true): void {
    if (!this.window || this.window.isDestroyed() || !this.ready) {
      return;
    }
    const payload: {
      dock: AudioPipDock;
      layoutKind: AudioPipLayoutKind;
      elements: AudioPipElementId[];
      edge: 'top' | 'bottom' | 'left' | 'right' | null;
      peeked: boolean;
      isPreview: boolean;
      state?: AudioPipState;
      cssVars: Record<string, string>;
    } = {
      dock: this.dock,
      layoutKind: this.layoutKind(),
      elements: this.activeElements(),
      edge: this.getEdge(),
      peeked: this.peeked,
      isPreview: this.isPreview,
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
      if (this.isPreview) return;
      this.mainWindow?.webContents.send('audio-pip:action', action);
    });

    ipcMain.on('audio-pip:progressClick', (_event, percent: number) => {
      if (this.isPreview) return;
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
      if (this.isPreview) return;
      Object.assign(this.currentState, state);
      if (this.window && !this.window.isDestroyed() && this.window.isVisible() && this.ready) {
        this.window.webContents.send('audio-pip:update', {
          dock: this.dock,
          layoutKind: this.layoutKind(),
          elements: this.activeElements(),
          edge: this.getEdge(),
          peeked: this.peeked,
          isPreview: false,
          state: this.currentState,
          cssVars: this.cssVars
        });
      }
    });

    ipcMain.on('audio-pip:vizData', (_event, data: number[]) => {
      if (this.isPreview) return;
      if (!this.activeElements().includes('viz')) return;
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
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.ready = false;
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
