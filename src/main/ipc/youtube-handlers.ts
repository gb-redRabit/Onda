import { ipcMain } from 'electron';
import { logger } from '../../shared/logger';

export function registerYoutubeHandlers(): void {
  ipcMain.handle('yt:search', async (_event, query: string) => {
    logger.warn('yt', 'search not implemented — yt-dlp API required. Query:', query);
    return {
      success: false,
      error: 'YouTube integration not yet implemented',
      items: [],
      nextPageToken: null,
      prevPageToken: null
    };
  });
}
