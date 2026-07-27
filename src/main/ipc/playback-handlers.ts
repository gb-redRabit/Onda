import { ipcMain } from 'electron';

const playbackPositions = new Map<string, number>();

export function registerPlaybackHandlers(): void {
  ipcMain.handle('playback:getPosition', (_event, filePath: string): number => {
    try {
      return playbackPositions.get(filePath) || 0;
    } catch {
      return 0;
    }
  });

  ipcMain.handle('playback:setPosition', (_event, filePath: string, position: number): void => {
    try {
      if (position > 0) playbackPositions.set(filePath, position);
      else playbackPositions.delete(filePath);
    } catch {
      // ignore
    }
  });

  ipcMain.handle('playback:clearPosition', (_event, filePath: string): void => {
    try {
      playbackPositions.delete(filePath);
    } catch {
      // ignore
    }
  });
}
