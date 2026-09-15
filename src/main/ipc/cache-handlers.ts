import { ipcMain } from 'electron';
import { clearAppCaches } from './app-cache';

export function registerCacheHandlers(): void {
  ipcMain.handle('cache:clear', () => clearAppCaches());
}
