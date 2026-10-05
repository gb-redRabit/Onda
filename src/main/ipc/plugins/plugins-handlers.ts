import { ipcMain, dialog, BrowserWindow } from 'electron';
import { join } from 'path';
import { rm } from 'fs/promises';
import type {
  PluginInfo,
  PluginExample,
  IpcPluginGetResult,
  IpcPluginUninstallResult,
  IpcPluginInstallResult,
  PluginFetchOptions,
  PluginFetchResult
} from '../../../shared/types/ipc';
import { logger } from '../../../shared/logger';
import { errMsg } from '../../../shared/helpers';
import {
  validatePluginId,
  isWithin,
  writeStorageFile,
  validStorageKey,
  sanitizeStoredObject,
  pluginSettingValueValid,
  pluginConsentHash,
  sha256Hex,
  pluginApprovalMatches,
  MAX_STORAGE_KEYS
} from './plugins-core';
import { runPluginFetch } from './plugins-fetch';
import { settingWriteAllowed, storagePermissionGranted } from './plugins-guards';
import { installPluginFromDir, listPluginExamples } from './plugins-examples';
import {
  getPluginsDir,
  getPluginsDataDir,
  getExamplesDir,
  pluginStorageFile,
  pluginSettingsFile,
  readManifest,
  readManifestById,
  readPluginEntry,
  readEntryDigest,
  approvedManifest,
  listInstalledPlugins,
  loadEnabledState,
  setEnabled,
  mergeInfos,
  storageData,
  settingsData
} from './plugins-store';

// Rejestracja kanałów `plugins:*`. Odczyt manifestów/stanu/storage żyje w
// `plugins-store.ts`; tutaj zostaje walidacja wejścia i podpięcie handlerów.

function getParentWindow(sender: Electron.WebContents): BrowserWindow | null {
  return (
    BrowserWindow.fromWebContents(sender) ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows()[0] ??
    null
  );
}

async function installFromFolder(sender: Electron.WebContents): Promise<IpcPluginInstallResult> {
  const win = getParentWindow(sender);
  const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) {
    return { success: false, error: 'cancelled' };
  }
  const source = result.filePaths[0];
  const sourceId =
    source
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || '';
  const result2 = await installPluginFromDir(source, getPluginsDir(), sourceId);
  if (!result2.success || !result2.installed) return result2;
  await setEnabled(result2.installed.id, false, null);
  const enabled = await loadEnabledState();
  const [info] = await mergeInfos([result2.installed], enabled);
  return { success: true, installed: info };
}

export function registerPluginsHandlers(): void {
  ipcMain.handle('plugins:list', async (): Promise<PluginInfo[]> => {
    try {
      const plugins = await listInstalledPlugins();
      return await mergeInfos(plugins, await loadEnabledState());
    } catch (e) {
      logger.warn('plugins', 'plugins:list failed', e);
      return [];
    }
  });

  ipcMain.handle('plugins:listExamples', async (): Promise<PluginExample[]> => {
    try {
      return await listPluginExamples(getExamplesDir());
    } catch (e) {
      logger.warn('plugins', 'plugins:listExamples failed', e);
      return [];
    }
  });

  ipcMain.handle(
    'plugins:installExample',
    async (_e, id: string): Promise<IpcPluginInstallResult> => {
      try {
        if (!validatePluginId(id)) return { success: false, error: 'Invalid plugin id' };
        const examples = await listPluginExamples(getExamplesDir());
        if (!examples.some((example) => example.id === id)) {
          return { success: false, error: 'Unknown example' };
        }
        const result = await installPluginFromDir(join(getExamplesDir(), id), getPluginsDir(), id);
        if (!result.success || !result.installed) return result;
        await setEnabled(id, false, null);
        const enabled = await loadEnabledState();
        const [info] = await mergeInfos([result.installed], enabled);
        return { success: true, installed: info };
      } catch (e) {
        logger.warn('plugins', 'plugins:installExample failed', e);
        return { success: false, error: errMsg(e) };
      }
    }
  );

  ipcMain.handle('plugins:get', async (_e, id: string): Promise<IpcPluginGetResult> => {
    try {
      if (!validatePluginId(id)) return { success: false, error: 'Invalid plugin id' };
      const dir = join(getPluginsDir(), id);
      const manifest = await readManifest(dir, id);
      if (!manifest) return { success: false, error: 'Plugin not found' };
      const code = await readPluginEntry(dir, id);
      if (code === null) return { success: false, error: 'Entry file missing' };
      // Zgoda jest związana z plikiem wejściowym, więc token zatwierdzenia, który renderer
      // przesyła, nigdy nie może zostać odtworzony dla innego kodu.
      return {
        success: true,
        manifest,
        code,
        consentHash: pluginConsentHash(manifest, sha256Hex(code))
      };
    } catch (e) {
      logger.warn('plugins', 'plugins:get failed', e);
      return { success: false, error: errMsg(e) };
    }
  });

  ipcMain.handle(
    'plugins:toggle',
    async (_e, id: string, enabled: boolean, approvedConsent?: string): Promise<boolean> => {
      try {
        if (!validatePluginId(id)) return false;
        if (enabled === true) {
          const manifest = await readManifestById(id);
          if (!manifest) return false;
          const dir = join(getPluginsDir(), id);
          const digest = await readEntryDigest(dir, id);
          if (!digest || !pluginApprovalMatches(manifest, digest, approvedConsent)) return false;
          await setEnabled(id, true, approvedConsent);
        } else {
          await setEnabled(id, false);
        }
        return true;
      } catch (e) {
        logger.warn('plugins', 'plugins:toggle failed', e);
        return false;
      }
    }
  );

  ipcMain.handle('plugins:uninstall', async (_e, id: string): Promise<IpcPluginUninstallResult> => {
    try {
      if (!validatePluginId(id)) return { success: false, error: 'Invalid plugin id' };
      const dir = join(getPluginsDir(), id);
      if (isWithin(getPluginsDir(), dir)) {
        await rm(dir, { recursive: true, force: true });
      }
      await rm(pluginStorageFile(id), { force: true });
      await rm(pluginSettingsFile(id), { force: true });
      await rm(join(getPluginsDataDir(), id), { recursive: true, force: true });
      await setEnabled(id, false);
      return { success: true };
    } catch (e) {
      logger.warn('plugins', 'plugins:uninstall failed', e);
      return { success: false, error: errMsg(e) };
    }
  });

  ipcMain.handle('plugins:installFromFolder', async (event): Promise<IpcPluginInstallResult> => {
    try {
      return await installFromFolder(event.sender);
    } catch (e) {
      logger.warn('plugins', 'plugins:installFromFolder failed', e);
      return { success: false, error: errMsg(e) };
    }
  });

  ipcMain.handle('plugins:storage:keys', async (_e, id: string): Promise<string[]> => {
    try {
      const manifest = await approvedManifest(id);
      if (!manifest || !storagePermissionGranted(manifest.permissions)) return [];
      return Object.keys(await storageData(id));
    } catch (e) {
      logger.warn('plugins', 'plugins:storage:keys failed', e);
      return [];
    }
  });

  ipcMain.handle('plugins:storage:get', async (_e, id: string, key: string): Promise<unknown> => {
    try {
      const manifest = await approvedManifest(id);
      if (!manifest || !storagePermissionGranted(manifest.permissions) || !validStorageKey(key)) {
        return null;
      }
      const data = await storageData(id);
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    } catch (e) {
      logger.warn('plugins', 'plugins:storage:get failed', e);
      return null;
    }
  });

  ipcMain.handle(
    'plugins:storage:set',
    async (_e, id: string, key: string, value: unknown): Promise<boolean> => {
      try {
        const manifest = await approvedManifest(id);
        if (!manifest || !storagePermissionGranted(manifest.permissions)) return false;
        if (!validStorageKey(key)) return false;
        const current = await storageData(id);
        if (
          !Object.prototype.hasOwnProperty.call(current, key) &&
          Object.keys(current).length >= MAX_STORAGE_KEYS
        ) {
          return false;
        }
        const next: Record<string, unknown> = { ...current, [key]: value };
        if (sanitizeStoredObject(next)[key] === undefined) return false;
        await writeStorageFile(pluginStorageFile(id), next);
        return true;
      } catch (e) {
        logger.warn('plugins', 'plugins:storage:set failed', e);
        return false;
      }
    }
  );

  ipcMain.handle(
    'plugins:storage:remove',
    async (_e, id: string, key: string): Promise<boolean> => {
      try {
        const manifest = await approvedManifest(id);
        if (!manifest || !storagePermissionGranted(manifest.permissions)) return false;
        if (!validStorageKey(key)) return false;
        const current = await storageData(id);
        if (!Object.prototype.hasOwnProperty.call(current, key)) return true;
        const next = { ...current };
        delete next[key];
        await writeStorageFile(pluginStorageFile(id), next);
        return true;
      } catch (e) {
        logger.warn('plugins', 'plugins:storage:remove failed', e);
        return false;
      }
    }
  );

  ipcMain.handle(
    'plugins:settings:get',
    async (_e, id: string): Promise<Record<string, unknown>> => {
      try {
        if (!validatePluginId(id)) return {};
        // Odczyt przez manifest migruje też wartości, które nie pasują już
        // do bieżącego schematu, przepisując plik raz.
        return await settingsData(id, await readManifestById(id));
      } catch (e) {
        logger.warn('plugins', 'plugins:settings:get failed', e);
        return {};
      }
    }
  );

  ipcMain.handle(
    'plugins:settings:set',
    async (_e, id: string, key: string, value: unknown): Promise<boolean> => {
      try {
        const manifest = await approvedManifest(id);
        if (!manifest || !validStorageKey(key)) return false;
        const field = manifest.settings?.find((candidate) => candidate.key === key);
        if (!field || !pluginSettingValueValid(field, value)) return false;
        const declared = manifest.settings?.map((field) => field.key);
        if (!settingWriteAllowed(manifest.permissions, declared, key)) return false;
        const next: Record<string, unknown> = {
          ...(await settingsData(id, manifest)),
          [key]: value
        };
        if (sanitizeStoredObject(next)[key] === undefined) return false;
        await writeStorageFile(pluginSettingsFile(id), next);
        return true;
      } catch (e) {
        logger.warn('plugins', 'plugins:settings:set failed', e);
        return false;
      }
    }
  );

  ipcMain.handle(
    'plugins:fetch',
    async (
      _e,
      id: string,
      url: string,
      options: PluginFetchOptions
    ): Promise<PluginFetchResult> => {
      try {
        // Zatwierdzenie, nie tylko manifest: zainstalowany plugin, którego użytkownik nigdy
        // nie aktywował — lub taki, którego kod zmienił się po przeglądzie — nie może
        // pożyczać tożsamości sieciowej aplikacji.
        const manifest = await approvedManifest(id);
        const allow = manifest?.permissions.network?.allow || [];
        if (!manifest || allow.length === 0) {
          return {
            success: false,
            error: 'Network access not permitted for this plugin',
            code: 'forbidden'
          };
        }
        return await runPluginFetch(allow, url, options);
      } catch (e) {
        logger.warn('plugins', 'plugins:fetch failed', e);
        return { success: false, error: errMsg(e) };
      }
    }
  );
}
