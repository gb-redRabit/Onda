import { ipcMain } from 'electron';
import type { AudioPipState } from '../../shared/types/pip';
import { logger } from '../../shared/logger';
import { sendToWindow } from '../utils/broadcast';

// Rejestracja kanałów `audio-pip:*` dla okna PiP audio, wyodrębniona z
// `audio-pip-manager.ts`. Manager dostarcza wąski interfejs (host), dzięki czemu
// ten moduł nie zna stanu okna ani layoutu.

export interface AudioPipIpcHost {
  mainWindow(): Electron.BrowserWindow | null;
  isPreview(): boolean;
  /** Aktualizuje stan z okna PiP (timeUpdate). */
  onTimeUpdate(state: AudioPipState): void;
  /** Przekazuje dane wizualizacji do okna PiP (gdy element 'viz' jest aktywny). */
  onVizData(data: number[]): void;
  setTheme(vars: Record<string, string>): void;
  /** Mysz weszła na pasek/wyszła i minimalizuje do slivera. */
  setMouseInside(inside: boolean): void;
  unpeek(): void;
  schedulePeek(): void;
}

export function registerAudioPipIpc(host: AudioPipIpcHost): void {
  ipcMain.on('audio-pip:showMain', () => {
    const main = host.mainWindow();
    if (main && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore();
      main.show();
      main.moveTop();
      main.focus();
    }
  });

  ipcMain.on('audio-pip:action', (_event, action: string) => {
    if (host.isPreview()) return;
    sendToWindow(host.mainWindow(), 'audio-pip:action', action);
  });

  ipcMain.on('audio-pip:progressClick', (_event, percent: number) => {
    if (host.isPreview()) return;
    sendToWindow(host.mainWindow(), 'audio-pip:progressClick', percent);
  });

  ipcMain.on('audio-pip:unpeek', () => {
    host.setMouseInside(true);
    host.unpeek();
  });

  ipcMain.on('audio-pip:peekDelay', () => {
    host.setMouseInside(false);
    host.schedulePeek();
  });

  ipcMain.on('audio-pip:theme', (_event, vars: Record<string, string>) => {
    host.setTheme(vars);
  });

  ipcMain.on('audio-pip:timeUpdate', (_event, state: AudioPipState) => {
    if (host.isPreview()) return;
    host.onTimeUpdate(state);
  });

  ipcMain.on('audio-pip:vizData', (_event, data: number[]) => {
    if (host.isPreview()) return;
    host.onVizData(data);
  });
}

export function removeAudioPipIpc(): void {
  ipcMain.removeAllListeners('audio-pip:showMain');
  ipcMain.removeAllListeners('audio-pip:action');
  ipcMain.removeAllListeners('audio-pip:progressClick');
  ipcMain.removeAllListeners('audio-pip:unpeek');
  ipcMain.removeAllListeners('audio-pip:peekDelay');
  ipcMain.removeAllListeners('audio-pip:timeUpdate');
  ipcMain.removeAllListeners('audio-pip:vizData');
  ipcMain.removeAllListeners('audio-pip:theme');
}

export function warnPipReposition(e: unknown): void {
  logger.warn('audio-pip', 'reposition failed', e);
}
