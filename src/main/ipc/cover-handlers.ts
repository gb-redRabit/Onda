import { ipcMain } from 'electron';
import { extractAndCacheCover } from './cover-cache';
import { isSafeAbsolutePath } from '../utils/validate';
import { logger } from '../../shared/logger';

export function registerCoverHandlers(): void {
  ipcMain.handle(
    'media:getCover',
    async (
      _event,
      filePath: string
    ): Promise<{ type: 'video' | 'image' | null; data: string | null }> => {
      if (!isSafeAbsolutePath(filePath)) {
        logger.warn('cover', `media:getCover rejected unsafe path: ${filePath}`);
        return { type: null, data: null };
      }
      const result = await extractAndCacheCover(filePath);
      return result;
    }
  );
}
