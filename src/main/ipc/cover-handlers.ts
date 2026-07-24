import { ipcMain } from 'electron';
import { extractAndCacheCover } from './cover-cache';

export function registerCoverHandlers(): void {
  ipcMain.handle(
    'media:getCover',
    async (
      _event,
      filePath: string
    ): Promise<{ type: 'video' | 'image' | null; data: string | null }> => {
      return extractAndCacheCover(filePath);
    }
  );
}
