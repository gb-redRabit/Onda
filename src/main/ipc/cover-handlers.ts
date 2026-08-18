import { ipcMain } from 'electron';
import { extractAndCacheCover } from './cover-cache';
import { isSafeAbsolutePath } from '../utils/validate';

export function registerCoverHandlers(): void {
  ipcMain.handle(
    'media:getCover',
    async (
      _event,
      filePath: string
    ): Promise<{ type: 'video' | 'image' | null; data: string | null }> => {
      if (!isSafeAbsolutePath(filePath)) return { type: null, data: null };
      return extractAndCacheCover(filePath);
    }
  );
}
