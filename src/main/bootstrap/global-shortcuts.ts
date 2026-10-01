import { globalShortcut, type BrowserWindow } from 'electron';
import { logger } from '../../shared/logger';

/**
 * Systemowe klawisze multimedialne przekazywane do renderera, aby sterowanie
 * odtwarzaniem działało, gdy Onda nie jest skupiona. `getMainWindow` jest
 * rozwiązywane przy każdym naciśnięciu klawisza (nie przechwytywane), ponieważ
 * okno może zostać odtworzone (np. ponowna aktywacja macOS).
 */
export function registerGlobalShortcuts(getMainWindow: () => BrowserWindow | null): void {
  const sendIfAlive = (channel: string): void => {
    const win = getMainWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel);
    }
  };

  const shortcuts: Record<string, () => void> = {
    MediaPlayPause: () => sendIfAlive('media:playPause'),
    MediaNextTrack: () => sendIfAlive('media:next'),
    MediaPreviousTrack: () => sendIfAlive('media:previous'),
    MediaStop: () => sendIfAlive('media:stop'),
    VolumeUp: () => sendIfAlive('media:volumeUp'),
    VolumeDown: () => sendIfAlive('media:volumeDown'),
    VolumeMute: () => sendIfAlive('media:toggleMute')
  };

  for (const [accelerator, handler] of Object.entries(shortcuts)) {
    try {
      globalShortcut.register(accelerator, handler);
    } catch (e) {
      logger.warn('main', `global shortcut unavailable: ${accelerator}`, e);
    }
  }
}
