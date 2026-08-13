import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile, readFile } from 'fs/promises';
import { getStore } from './cover-cache';
import { configureAutoCheck } from '../updater-scheduler';
import { sanitizeSettings } from './settings-schema';
import { encryptApiKeys, decryptApiKeys } from './settings-crypto';
import { syncSubscriptionsScheduler } from './subscriptions-handlers';
import { setCloseToTray } from '../close-behavior';
import type { AppSettings } from '../../renderer/src/types/settings';
import { logger } from '../../shared/logger';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async (): Promise<Partial<AppSettings>> => {
    try {
      const store = await getStore();
      const { sanitized } = sanitizeSettings(store.store || {});
      if (sanitized.apiKeys) sanitized.apiKeys = decryptApiKeys(sanitized.apiKeys);
      return sanitized;
    } catch (e) {
      logger.warn('settings', 'settings:get failed', e);
      return {};
    }
  });

  ipcMain.handle('settings:set', async (_event, data: Partial<AppSettings>): Promise<boolean> => {
    try {
      const { sanitized, droppedKeys } = sanitizeSettings(data);
      if (droppedKeys.length > 0) {
        logger.warn('settings', `settings:set dropped invalid keys: ${droppedKeys.join(', ')}`);
      }
      if (sanitized.apiKeys) sanitized.apiKeys = encryptApiKeys(sanitized.apiKeys);
      const store = await getStore();
      for (const [key, value] of Object.entries(sanitized)) {
        store.set(key, value);
      }
      if (sanitized.general) setCloseToTray(sanitized.general.closeToTray !== false);
      if (sanitized.updates) void configureAutoCheck();
      if (sanitized.download) void syncSubscriptionsScheduler();
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
        const { sanitized } = sanitizeSettings(store.store || {});
        const exported: Partial<AppSettings> = { ...sanitized };
        // Never write secrets (API keys, proxy password) to an unencrypted export file.
        delete exported.apiKeys;
        if (exported.network?.proxy) {
          exported.network = {
            ...exported.network,
            proxy: { ...exported.network.proxy, password: undefined }
          };
        }
        await writeFile(result.filePath, JSON.stringify(exported, null, 2), 'utf-8');
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
    async (
      event
    ): Promise<{
      success: boolean;
      canceled?: boolean;
      data?: Partial<AppSettings>;
      error?: string;
    }> => {
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
        const { sanitized, droppedKeys } = sanitizeSettings(parsed);
        if (droppedKeys.length > 0) {
          logger.warn(
            'settings',
            `settings:import dropped invalid keys: ${droppedKeys.join(', ')}`
          );
        }
        // Encrypt secrets before they ever reach disk.
        const toPersist: Partial<AppSettings> = { ...sanitized };
        if (toPersist.apiKeys) toPersist.apiKeys = encryptApiKeys(toPersist.apiKeys);
        const store = await getStore();
        for (const [key, value] of Object.entries(toPersist)) {
          store.set(key, value);
        }
        if (toPersist.general) setCloseToTray(toPersist.general.closeToTray !== false);
        if (toPersist.updates) void configureAutoCheck();
        if (toPersist.download) void syncSubscriptionsScheduler();
        // return plaintext keys so the renderer store stays consistent (no double-encrypt on save)
        const data: Partial<AppSettings> = { ...toPersist };
        if (data.apiKeys) data.apiKeys = decryptApiKeys(data.apiKeys);
        return { success: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('settings', 'settings:import failed', e);
        return { success: false, error: msg };
      }
    }
  );
}
