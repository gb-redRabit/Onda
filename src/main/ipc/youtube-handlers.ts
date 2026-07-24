import { ipcMain } from 'electron';
import { logger } from '../utils/logger';

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

  ipcMain.handle('yt:getInfo', async (_event, videoId: string) => {
    logger.warn('yt', 'getInfo not implemented — yt-dlp API required. Id:', videoId);
    return { success: false, error: 'YouTube integration not yet implemented' };
  });

  ipcMain.handle('yt:download', async (_event, url: string, format: string) => {
    logger.warn(
      'yt',
      'download not implemented — yt-dlp API required. URL:',
      url,
      'Format:',
      format
    );
    return { success: false, error: 'YouTube integration not yet implemented' };
  });

  ipcMain.handle('yt:getChannel', async (_event, channelId: string) => {
    logger.warn('yt', 'getChannel not implemented — yt-dlp API required. Id:', channelId);
    return { success: false, error: 'YouTube integration not yet implemented' };
  });
}
