import { dialog, BrowserWindow } from 'electron';
import { handleIpc } from '../typed-handle';
import {
  startGoogleLogin,
  logout,
  importCookiesFromFile,
  exportCookiesToFile,
  getAuthStatus,
  type YoutubeAuthStatus
} from '../../youtube/youtube-auth';
import { logger } from '../../../shared/logger';

export function registerYoutubeAuthHandlers(): void {
  handleIpc('yt:authStatus', async (): Promise<YoutubeAuthStatus> => {
    try {
      return await getAuthStatus();
    } catch (e) {
      logger.warn('yt', 'yt:authStatus failed', e);
      return { method: 'none', loggedIn: false };
    }
  });

  handleIpc('yt:login', async () => {
    return startGoogleLogin();
  });

  handleIpc('yt:logout', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await logout();
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  });

  handleIpc(
    'yt:importCookies',
    async (event): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { success: false, error: 'No window' };
      const result = await dialog.showOpenDialog(win, {
        title: 'Import cookies',
        properties: ['openFile'],
        filters: [{ name: 'Cookies', extensions: ['txt'] }]
      });
      if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
      return importCookiesFromFile(result.filePaths[0]);
    }
  );

  handleIpc(
    'yt:exportCookies',
    async (event): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { success: false, error: 'No window' };
      const result = await dialog.showSaveDialog(win, {
        title: 'Export cookies',
        defaultPath: 'youtube-cookies.txt',
        filters: [{ name: 'Cookies', extensions: ['txt'] }]
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      return exportCookiesToFile(result.filePath);
    }
  );
}
