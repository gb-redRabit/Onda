import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readdir } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { VIDEO_EXTS, AUDIO_EXTS } from '../../shared/constants';
import { addAllowedRoot } from '../media-server';
import { logger } from '../../shared/logger';

function getParentWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

export function registerDialogHandlers(): void {
  ipcMain.handle(
    'dialog:openImage',
    async (_event): Promise<{ canceled: boolean; filePaths: string[] }> => {
      try {
        const win = getParentWindow();
        const result = win
          ? await dialog.showOpenDialog(win, {
              properties: ['openFile'],
              filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
            })
          : await dialog.showOpenDialog({
              properties: ['openFile'],
              filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
            });
        return { canceled: result.canceled, filePaths: result.filePaths.slice() };
      } catch (e) {
        logger.warn('dialog', 'openImage failed', e);
        return { canceled: true, filePaths: [] };
      }
    }
  );

  ipcMain.handle(
    'dialog:openSubtitle',
    async (_event): Promise<{ canceled: boolean; filePaths: string[] }> => {
      try {
        const win = getParentWindow();
        const options: Electron.OpenDialogOptions = {
          properties: ['openFile', 'multiSelections'],
          filters: [
            {
              name: 'Subtitles',
              extensions: ['srt', 'ass', 'ssa', 'vtt', 'sub']
            },
            { name: 'All Files', extensions: ['*'] }
          ]
        };
        const result = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options);
        return { canceled: result.canceled, filePaths: result.filePaths.slice() };
      } catch (e) {
        logger.warn('dialog', 'openSubtitle failed', e);
        return { canceled: true, filePaths: [] };
      }
    }
  );

  ipcMain.handle('dialog:openFile', async (_event, options?: Electron.OpenDialogOptions) => {
    try {
      const win = getParentWindow();
      const dialogOptions: Electron.OpenDialogOptions = {
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Media Files',
            extensions: [
              'mp3',
              'flac',
              'wav',
              'ogg',
              'aac',
              'm4a',
              'mp4',
              'mkv',
              'avi',
              'webm',
              'mov'
            ]
          },
          { name: 'All Files', extensions: ['*'] }
        ],
        ...options
      };
      const result = win
        ? await dialog.showOpenDialog(win, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      logger.info(
        'dialog',
        `openFile result: canceled=${result.canceled} paths=${result.filePaths.length}`
      );
      if (!result.canceled) {
        for (const p of result.filePaths) {
          await addAllowedRoot(dirname(p));
          logger.info('dialog', `openFile granted root: ${dirname(p)}`);
        }
      }
      return result;
    } catch (e) {
      logger.warn('dialog', 'openFile failed', e);
      return { canceled: true, filePaths: [] };
    }
  });

  ipcMain.handle('dialog:openFolder', async (_event): Promise<string[]> => {
    try {
      const win = getParentWindow();
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (!result.canceled) {
        for (const p of result.filePaths) {
          await addAllowedRoot(p);
        }
      }
      return result.canceled ? [] : result.filePaths;
    } catch (e) {
      logger.warn('dialog', 'openFolder failed', e);
      return [];
    }
  });

  ipcMain.handle('dialog:openFolderFiles', async (_event) => {
    try {
      const win = getParentWindow();
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (result.canceled || !result.filePaths.length) {
        return { canceled: true, filePaths: [] as string[] };
      }
      const folder = result.filePaths[0];
      if (!folder) return { canceled: false, filePaths: [] };
      await addAllowedRoot(folder);
      const mediaExts = [...VIDEO_EXTS, ...AUDIO_EXTS];
      let entries: string[] = [];
      try {
        const dirEntries = await readdir(folder);
        entries = dirEntries
          .filter((f) => mediaExts.includes(extname(f).toLowerCase()))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map((f) => join(folder, f));
      } catch (e) {
        logger.warn('dialog', `openFolderFiles readdir failed for ${folder}`, e);
        entries = [];
      }
      return { canceled: false, filePaths: entries };
    } catch (e) {
      logger.warn('dialog', 'openFolderFiles failed', e);
      return { canceled: true, filePaths: [] };
    }
  });
}
