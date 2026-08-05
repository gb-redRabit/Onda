import { ipcMain } from 'electron';
import { getUpdaterState, checkForUpdates, downloadUpdate, installUpdate } from '../updater';

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:getState', () => getUpdaterState());
  ipcMain.handle('updater:check', () => checkForUpdates());
  ipcMain.handle('updater:download', () => downloadUpdate());
  ipcMain.handle('updater:install', () => {
    installUpdate();
  });
}
