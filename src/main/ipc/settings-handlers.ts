import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile, readFile } from 'fs/promises';
import { getStore } from './cover-cache';
import type { AppSettings } from '../../renderer/src/types/settings';
import { logger } from '../../shared/logger';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async (): Promise<Partial<AppSettings>> => {
    try {
      const store = await getStore();
      return (store.store || {}) as Partial<AppSettings>;
    } catch (e) {
      logger.warn('settings', 'settings:get failed', e);
      return {};
    }
  });

  ipcMain.handle('settings:set', async (_event, data: Partial<AppSettings>): Promise<boolean> => {
    try {
      const store = await getStore();
      for (const [key, value] of Object.entries(data)) {
        store.set(key, value);
      }
      return true;
    } catch (e) {
      logger.warn('settings', 'settings:set failed', e);
      return false;
    }
  });

  ipcMain.handle(
    'settings:export',
    async (event): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false, error: 'No window' };
        const result = await dialog.showSaveDialog(win, {
          title: 'Export Onda settings',
          defaultPath: 'onda-settings.json',
          filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        const store = await getStore();
        await writeFile(result.filePath, JSON.stringify(store.store || {}, null, 2), 'utf-8');
        return { success: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('settings', 'settings:export failed', e);
        return { success: false, error: msg };
      }
    }
  );

  ipcMain.handle(
    'settings:import',
    async (event): Promise<{ success: boolean; canceled?: boolean; data?: Partial<AppSettings>; error?: string }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false, error: 'No window' };
        const result = await dialog.showOpenDialog(win, {
          title: 'Import Onda settings',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
        const raw = await readFile(result.filePaths[0], 'utf-8');
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        const store = await getStore();
        for (const [key, value] of Object.entries(parsed)) {
          store.set(key, value);
        }
        return { success: true, data: parsed };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('settings', 'settings:import failed', e);
        return { success: false, error: msg };
      }
    }
  );
}
