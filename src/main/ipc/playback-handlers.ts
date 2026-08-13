import { ipcMain } from 'electron';
import { stat } from 'fs/promises';
import { getStore } from './cover-cache';
import { logger } from '../../shared/logger';

const PLAYBACK_KEY = 'playbackPositions';
const MAX_ENTRIES = 500;

const playbackPositions = new Map<string, number>();

async function persist(filePath: string, position: number | null): Promise<void> {
  try {
    const store = await getStore();
    const all = (store.get(PLAYBACK_KEY) as Record<string, number> | undefined) || {};
    if (position === null) {
      delete all[filePath];
    } else {
      all[filePath] = position;
    }
    // Keep the store bounded — drop the oldest entries past the cap.
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete all[k];
    }
    store.set(PLAYBACK_KEY, all);
  } catch (e) {
    logger.warn('playback', 'persist position failed', e);
  }
}

export function registerPlaybackHandlers(): void {
  ipcMain.handle('playback:getPosition', async (_event, filePath: string): Promise<number> => {
    try {
      if (playbackPositions.has(filePath)) return playbackPositions.get(filePath) || 0;
      const store = await getStore();
      const all = (store.get(PLAYBACK_KEY) as Record<string, number> | undefined) || {};
      const pos = all[filePath];
      if (typeof pos === 'number' && pos > 0) {
        playbackPositions.set(filePath, pos);
        return pos;
      }
      // Lazily clean up entries pointing at files that no longer exist.
      if (filePath && all[filePath] !== undefined) {
        const exists = await stat(filePath).catch(() => null);
        if (!exists) {
          delete all[filePath];
          store.set(PLAYBACK_KEY, all);
        }
      }
      return 0;
    } catch (e) {
      logger.warn('playback', 'getPosition failed', e);
      return 0;
    }
  });

  ipcMain.handle(
    'playback:setPosition',
    async (_event, filePath: string, position: number): Promise<void> => {
      try {
        if (typeof position === 'number' && position > 0) {
          playbackPositions.set(filePath, position);
          await persist(filePath, position);
        } else {
          playbackPositions.delete(filePath);
          await persist(filePath, null);
        }
      } catch (e) {
        logger.warn('playback', 'setPosition failed', e);
      }
    }
  );

  ipcMain.handle('playback:clearPosition', async (_event, filePath: string): Promise<void> => {
    try {
      playbackPositions.delete(filePath);
      await persist(filePath, null);
    } catch (e) {
      logger.warn('playback', 'clearPosition failed', e);
    }
  });
}
