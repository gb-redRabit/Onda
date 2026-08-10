import { ipcMain } from 'electron';
import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';
import { getYtAuthConfig } from '../youtube-auth';
import { logger } from '../../shared/logger';
import {
  formatDuration,
  formatUploadDate,
  pickThumbnail,
  buildYtArgs,
  type YtDlpEntry
} from './youtube-utils';

export function registerYoutubeHandlers(): void {
  ipcMain.handle('yt:search', async (_event, query: string) => {
    try {
      const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
      const auth = await getYtAuthConfig();
      const args = buildYtArgs(
        [`ytsearch10:${query}`, '--flat-playlist', '--no-warnings', '-J'],
        auth
      );
      const stdout = await runCommand(bin, args, { timeout: 60000 });
      const parsed = JSON.parse(stdout) as { entries?: YtDlpEntry[] };
      const items = (parsed.entries || [])
        .filter((e) => e.id && e.title)
        .map((e) => ({
          id: e.id as string,
          title: e.title as string,
          description: e.description || '',
          thumbnail: pickThumbnail(e),
          channelTitle: e.channel || e.uploader || '',
          channelId: e.channel_id || '',
          duration: formatDuration(e.duration),
          viewCount: e.view_count != null ? String(e.view_count) : undefined,
          publishedAt: formatUploadDate(e.upload_date)
        }));
      return { success: true, items, nextPageToken: null, prevPageToken: null };
    } catch (e: unknown) {
      const err = e as { message?: string };
      logger.warn('yt', 'search failed', err.message || String(e));
      return {
        success: false,
        error: err.message || 'YouTube search failed',
        items: [],
        nextPageToken: null,
        prevPageToken: null
      };
    }
  });
}
