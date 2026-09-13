import { BrowserWindow } from 'electron';
import { join } from 'path';
import { logger } from '../shared/logger';
import { installNavigationGuard } from './navigation-guard';

// Boot splash window + "show main window when ready" gate, extracted from
// `main/index.ts` (plan 2.8). Readiness is signalled from three independent
// sources (main process `did-finish-load`, a minimum-display timer, and the
// renderer's `app:rendererReady`); the main window is only shown once all three
// have fired.

export interface SplashDeps {
  windowIcon: () => string | undefined;
  getMainWindow: () => BrowserWindow | null;
  isStartHidden: () => boolean;
}

export class SplashController {
  private win: BrowserWindow | null = null;
  private mainReady = false;
  private minTimerDone = false;
  private rendererReady = false;
  private startTs = 0;

  constructor(private readonly deps: SplashDeps) {}

  isActive(): boolean {
    return this.win !== null;
  }

  start(): void {
    this.startTs = performance.now();
    const splash = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      icon: this.deps.windowIcon(),
      webPreferences: {
        sandbox: true,
        preload: join(__dirname, '../preload/splash.js')
      }
    });

    splash.loadFile(join(__dirname, '../../resources/splash.html'));
    installNavigationGuard(splash);
    this.win = splash;
  }

  private maybeShow(): void {
    if (!this.mainReady || !this.minTimerDone || !this.rendererReady) return;
    const total = Math.round(performance.now() - this.startTs);
    logger.info(
      'boot',
      `SHOW WINDOW — ${total}ms (mainReady=${this.mainReady} minTimer=${this.minTimerDone} renderer=${this.rendererReady})`
    );
    this.send('Gotowe', 100);
    this.win?.close();
    this.win = null;
    const main = this.deps.getMainWindow();
    if (!this.deps.isStartHidden()) {
      main?.show();
      main?.focus();
    }
  }

  onMainReady(): void {
    this.mainReady = true;
    this.maybeShow();
  }

  onMinTimerDone(): void {
    this.minTimerDone = true;
    this.maybeShow();
  }

  onRendererReady(): void {
    this.rendererReady = true;
    this.maybeShow();
  }

  send(label: string, progress: number): void {
    this.win?.webContents.send('splash:status', { label, progress });
  }

  forceClose(): void {
    if (!this.win) return;
    this.win.close();
    this.win = null;
    const main = this.deps.getMainWindow();
    if (!this.deps.isStartHidden() && !main?.isVisible()) {
      main?.show();
      main?.focus();
    }
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
