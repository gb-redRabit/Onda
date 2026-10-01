import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile, readFile } from 'fs/promises';
import { getStore } from '../cover/cover-cache';
import { isResetting } from '../factory-reset';
import { configureAutoCheck } from '../../updater-scheduler';
import { applyLogSettings } from '../../log-file';
import { applyCoverCacheSettings } from '../cover/cover-cache';
import { sanitizeSettings } from './settings-schema';
import {
  encryptApiKeys,
  decryptApiKeys,
  encryptionStatus,
  SecretStorageUnavailableError
} from './settings-crypto';
import { syncSubscriptionsScheduler } from '../subscriptions/subscriptions-handlers';
import { setCloseToTray } from '../../windows/close-behavior';
import type { AppSettings } from '../../../shared/types/settings';
import { logger } from '../../../shared/logger';

/**
 * Encrypt the API keys in place, or drop them from the payload.
 *
 * encryptSecret throws when the platform cannot protect the value. Letting that
 * escape would fail the whole save, so a user who once typed an API key could no
 * longer change any other setting. Only the key is dropped instead, and the
 * handler reports the partial save by returning false. The API keys panel shows
 * the reason before the user pastes anything, so this is the backstop rather
 * than the notice.
 *
 * Returns whether the keys were stored.
 */
function encryptKeysOrDrop(payload: Partial<AppSettings>): boolean {
  if (!payload.apiKeys) return true;
  try {
    payload.apiKeys = encryptApiKeys(payload.apiKeys);
    return true;
  } catch (e) {
    if (!(e instanceof SecretStorageUnavailableError)) throw e;
    delete payload.apiKeys;
    return false;
  }
}

export function registerSettingsHandlers(): void {
  // Reported to the API keys panel so the user learns the platform cannot
  // protect the secret before pasting it, rather than after trusting that it was
  // saved.
  ipcMain.handle('settings:secretStorageStatus', () => encryptionStatus());

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
    // A factory reset already cleared the store; late debounced saves from the
    // renderer must not resurrect the old settings before the restart.
    if (isResetting()) return false;
    try {
      const { sanitized, droppedKeys } = sanitizeSettings(data);
      if (droppedKeys.length > 0) {
        logger.warn('settings', `settings:set dropped invalid keys: ${droppedKeys.join(', ')}`);
      }
      const secretSaved = encryptKeysOrDrop(sanitized);
      const store = await getStore();
      for (const [key, value] of Object.entries(sanitized)) {
        store.set(key, value);
      }
      if (sanitized.general) {
        setCloseToTray(sanitized.general.closeToTray !== false);
        applyLogSettings(sanitized.general.logLevel, sanitized.general.logMaxSizeMB);
      }
      if (sanitized.library) applyCoverCacheSettings(sanitized.library.coverCacheMaxEntries);
      if (sanitized.updates) void configureAutoCheck();
      if (sanitized.download) void syncSubscriptionsScheduler();
      return secretSaved;
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
        // Encrypt secrets before they ever reach disk. If the platform cannot
        // protect them the keys are dropped from the import and the failure is
        // reported to the user, rather than the whole import being rejected or
        // the keys landing on disk in the clear.
        const toPersist: Partial<AppSettings> = { ...sanitized };
        const keysStored = encryptKeysOrDrop(toPersist);
        const store = await getStore();
        for (const [key, value] of Object.entries(toPersist)) {
          store.set(key, value);
        }
        if (toPersist.general) {
          setCloseToTray(toPersist.general.closeToTray !== false);
          applyLogSettings(toPersist.general.logLevel, toPersist.general.logMaxSizeMB);
        }
        if (toPersist.library) applyCoverCacheSettings(toPersist.library.coverCacheMaxEntries);
        if (toPersist.updates) void configureAutoCheck();
        if (toPersist.download) void syncSubscriptionsScheduler();
        // return plaintext keys so the renderer store stays consistent (no double-encrypt on save)
        const data: Partial<AppSettings> = { ...toPersist };
        if (data.apiKeys) data.apiKeys = decryptApiKeys(data.apiKeys);
        if (!keysStored) {
          return {
            success: false,
            error:
              'Settings were imported, but API keys were skipped: this system has no key storage.'
          };
        }
        return { success: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('settings', 'settings:import failed', e);
        return { success: false, error: msg };
      }
    }
  );
}
