import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  startGoogleLogin,
  logout,
  importCookiesFromFile,
  exportCookiesToFile,
  getAuthStatus,
  type YoutubeAuthStatus
} from '../youtube-auth';
import { logger } from '../../shared/logger';

export function registerYoutubeAuthHandlers(): void {
  ipcMain.handle('yt:authStatus', async (): Promise<YoutubeAuthStatus> => {
    try {
      return await getAuthStatus();
    } catch (e) {
      logger.warn('yt', 'yt:authStatus failed', e);
      return { method: 'none', loggedIn: false };
    }
  });

  ipcMain.handle('yt:login', async () => {
    return startGoogleLogin();
  });

  ipcMain.handle('yt:logout', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await logout();
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle(
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

  ipcMain.handle(
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
