import { ipcMain } from 'electron';
import { getStore } from './cover-cache';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async () => {
    try {
      const store = await getStore();
      return store.store || {};
    } catch {
      return {};
    }
  });

  ipcMain.handle('settings:set', async (_event, data: Record<string, unknown>) => {
    try {
      const store = await getStore();
      for (const [key, value] of Object.entries(data)) {
        store.set(key, value);
      }
      return true;
    } catch {
      return false;
    }
  });
}
