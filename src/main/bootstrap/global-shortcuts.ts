import { globalShortcut, type BrowserWindow } from 'electron';
import { logger } from '../../shared/logger';

/**
 * OS-wide media keys forwarded to the renderer, so playback control works while
 * Onda is not focused. `getMainWindow` is resolved on each keypress (not
 * captured) because the window can be recreated (e.g. macOS re-activate).
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
