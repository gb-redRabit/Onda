import { handleIpc } from './typed-handle';
import { getUpdaterState, checkForUpdates, downloadUpdate, installUpdate } from '../updater';

export function registerUpdaterHandlers(): void {
  handleIpc('updater:getState', () => getUpdaterState());
  handleIpc('updater:check', () => checkForUpdates());
  handleIpc('updater:download', () => downloadUpdate());
  handleIpc('updater:install', () => {
    installUpdate();
  });
}
