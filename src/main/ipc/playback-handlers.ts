import { ipcMain } from 'electron';
import { logger } from '../../shared/logger';

const playbackPositions = new Map<string, number>();

export function registerPlaybackHandlers(): void {
  ipcMain.handle('playback:getPosition', (_event, filePath: string): number => {
    try {
      return playbackPositions.get(filePath) || 0;
    } catch (e) {
      logger.warn('playback', 'getPosition failed', e);
      return 0;
    }
  });

  ipcMain.handle('playback:setPosition', (_event, filePath: string, position: number): void => {
    try {
      if (position > 0) playbackPositions.set(filePath, position);
      else playbackPositions.delete(filePath);
    } catch (e) {
      logger.warn('playback', 'setPosition failed', e);
    }
  });

  ipcMain.handle('playback:clearPosition', (_event, filePath: string): void => {
    try {
      playbackPositions.delete(filePath);
    } catch (e) {
      logger.warn('playback', 'clearPosition failed', e);
    }
  });
}
