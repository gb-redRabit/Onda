import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import { join, sep, resolve } from 'path';
import { readdir, readFile, mkdir, rm } from 'fs/promises';
import type {
  PluginInfo,
  PluginExample,
  PluginManifest,
  IpcPluginGetResult,
  IpcPluginUninstallResult,
  IpcPluginInstallResult,
  PluginFetchOptions,
  PluginFetchResult
} from '../../shared/types/ipc';
import { logger } from '../../shared/logger';
import {
  validatePluginId,
  isWithin,
  parseManifest,
  loadStateFile,
  saveStateFile,
  readStorageFile,
  writeStorageFile,
  validStorageKey,
  sanitizeStoredObject,
  pluginSettingValueValid,
  pluginCapabilityHash,
  pluginConsentHash,
  pluginApprovalMatches,
  normalizePluginSettings,
  sha256Hex,
  MAX_MANIFEST_BYTES,
  MAX_ENTRY_BYTES,
  MAX_PLUGINS,
  MAX_STORAGE_KEYS
} from './plugins-core';
import type { PluginStateFile } from './plugins-core';
import { runPluginFetch } from './plugins-fetch';
import { settingWriteAllowed, storagePermissionGranted } from './plugins-guards';
import { installPluginFromDir, listPluginExamples } from './plugins-examples';

let pluginsDir: string | null = null;
let pluginsDataDir: string | null = null;

function getPluginsDir(): string {
  if (!pluginsDir) pluginsDir = join(app.getPath('userData'), 'plugins');
  return pluginsDir;
}

// Bundled examples ship inside the app bundle: dev `out/main` → repo
// `resources/`, packaged `app.asar/out/main` → `app.asar/resources/`.
function getExamplesDir(): string {
  return join(__dirname, '../../resources/plugins-examples');
}

function getPluginsDataDir(): string {
  if (!pluginsDataDir) pluginsDataDir = join(app.getPath('userData'), 'plugins-data');
  return pluginsDataDir;
}

function stateFilePath(): string {
  return join(app.getPath('userData'), 'plugins-state.json');
}

function pluginStorageFile(id: string): string {
  return join(getPluginsDataDir(), id, 'storage.json');
}

function pluginSettingsFile(id: string): string {
  return join(getPluginsDataDir(), id, 'settings.json');
}

function getParentWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function pickError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function readManifest(dir: string, folderId: string): Promise<PluginManifest | null> {
  try {
    const raw = await readFile(join(dir, 'manifest.json'), 'utf-8');
    if (Buffer.byteLength(raw, 'utf-8') > MAX_MANIFEST_BYTES) return null;
    if (!validatePluginId(folderId)) return null;
    const { manifest, error } = parseManifest(JSON.parse(raw), folderId);
    if (error || !manifest) return null;
    if (!isWithin(dir, resolve(dir, manifest.entry))) return null;
    return manifest;
  } catch {
    return null;
  }
}

async function readManifestSafe(dir: string): Promise<PluginInfo | null> {
  const folderId = dir.split(sep).pop() || '';
  const manifest = await readManifest(dir, folderId);
  if (!manifest) return null;
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    enabled: false,
    permissions: manifest.permissions,
    hooks: manifest.hooks,
    layoutElements: manifest.layoutElements,
    uiSlots: manifest.uiSlots,
    capabilityHash: pluginCapabilityHash(manifest)
  };
}

async function listInstalledPlugins(): Promise<PluginInfo[]> {
  const base = getPluginsDir();
  await mkdir(base, { recursive: true });
  const entries = await readdir(base, { withFileTypes: true });
  const found: PluginInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !validatePluginId(entry.name)) continue;
    const dir = join(base, entry.name);
    const info = await readManifestSafe(dir);
    if (info) found.push(info);
    if (found.length >= MAX_PLUGINS) break;
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

async function readManifestById(id: string): Promise<PluginManifest | null> {
  if (!validatePluginId(id)) return null;
  return readManifest(join(getPluginsDir(), id), id);
}

function loadEnabledState(): Promise<PluginStateFile> {
  return loadStateFile(stateFilePath());
}

async function setEnabled(
  id: string,
  enabled: boolean,
  approvedConsent?: string | null
): Promise<void> {
  const state = await loadEnabledState();
  if (approvedConsent === null) {
    state[id] = { enabled };
  } else if (typeof approvedConsent === 'string') {
    state[id] = { enabled, approvedConsent };
  } else {
    state[id] = { ...state[id], enabled };
  }
  await saveStateFile(stateFilePath(), state);
}

/**
 * A plugin only stays enabled while the saved consent still matches the current
 * manifest AND entry digest, so editing a plugin's code or capabilities forces
 * a fresh review instead of silently running unapproved code after a restart.
 */
async function mergeInfos(plugins: PluginInfo[], state: PluginStateFile): Promise<PluginInfo[]> {
  const out: PluginInfo[] = [];
  for (const plugin of plugins) {
    const saved = state[plugin.id];
    let consentApproved = false;
    if (saved?.enabled === true && saved.approvedConsent) {
      const dir = join(getPluginsDir(), plugin.id);
      const digest = await readEntryDigest(dir, plugin.id);
      if (digest) {
        const manifest = await readManifest(dir, plugin.id);
        consentApproved =
          !!manifest && pluginApprovalMatches(manifest, digest, saved.approvedConsent);
      }
    }
    const permissionReviewRequired = saved?.enabled === true && !consentApproved;
    out.push({
      ...plugin,
      enabled: saved?.enabled === true && consentApproved,
      permissionReviewRequired
    });
  }
  return out;
}

async function storageData(id: string): Promise<Record<string, unknown>> {
  const base = getPluginsDataDir();
  await mkdir(join(base, id), { recursive: true });
  return readStorageFile(pluginStorageFile(id));
}

/**
 * Reads persisted plugin settings and migrates them to the current manifest
 * schema: undeclared keys are dropped and out-of-schema values fall back to a
 * valid default. The file is rewritten once so the migration does not repeat
 * on every read.
 */
async function settingsData(
  id: string,
  manifest?: PluginManifest | null
): Promise<Record<string, unknown>> {
  const base = getPluginsDataDir();
  await mkdir(join(base, id), { recursive: true });
  const file = pluginSettingsFile(id);
  const stored = await readStorageFile(file);
  if (!manifest?.settings?.length) return stored;
  const { value, changed } = normalizePluginSettings(manifest, stored);
  if (changed) {
    try {
      await writeStorageFile(file, value);
    } catch (e) {
      logger.warn('plugins', 'settings migration write failed', e);
    }
  }
  return value;
}

async function readPluginEntry(dir: string, id: string): Promise<string | null> {
  try {
    const manifest = await readManifest(dir, id);
    if (!manifest) return null;
    const entryPath = resolve(dir, manifest.entry);
    const entry = await readFile(entryPath, 'utf-8');
    if (Buffer.byteLength(entry, 'utf-8') > MAX_ENTRY_BYTES) return null;
    return entry;
  } catch {
    return null;
  }
}

/** SHA-256 of the plugin entry file, so consent is bound to the actual code. */
async function readEntryDigest(dir: string, id: string): Promise<string | null> {
  const code = await readPluginEntry(dir, id);
  return code === null ? null : sha256Hex(code);
}

async function installFromFolder(): Promise<IpcPluginInstallResult> {
  const win = getParentWindow();
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
        return { success: false, error: pickError(e) };
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
      // Consent is bound to the entry file, so the approval token the renderer
      // submits can never be replayed against different code.
      return {
        success: true,
        manifest,
        code,
        consentHash: pluginConsentHash(manifest, sha256Hex(code))
      };
    } catch (e) {
      logger.warn('plugins', 'plugins:get failed', e);
      return { success: false, error: pickError(e) };
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
      return { success: false, error: pickError(e) };
    }
  });

  ipcMain.handle('plugins:installFromFolder', async (): Promise<IpcPluginInstallResult> => {
    try {
      return await installFromFolder();
    } catch (e) {
      logger.warn('plugins', 'plugins:installFromFolder failed', e);
      return { success: false, error: pickError(e) };
    }
  });

  ipcMain.handle('plugins:storage:keys', async (_e, id: string): Promise<string[]> => {
    try {
      const manifest = await readManifestById(id);
      if (!manifest || !storagePermissionGranted(manifest.permissions)) return [];
      return Object.keys(await storageData(id));
    } catch (e) {
      logger.warn('plugins', 'plugins:storage:keys failed', e);
      return [];
    }
  });

  ipcMain.handle('plugins:storage:get', async (_e, id: string, key: string): Promise<unknown> => {
    try {
      const manifest = await readManifestById(id);
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
        const manifest = await readManifestById(id);
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
        const manifest = await readManifestById(id);
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
        // Reading through the manifest also migrates values that no longer
        // match the current schema, rewriting the file once.
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
        const manifest = await readManifestById(id);
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
        const plugins = await listInstalledPlugins();
        const info = plugins.find((p) => p.id === id);
        const allow = info?.permissions.network?.allow || [];
        if (!info || allow.length === 0) {
          return {
            success: false,
            error: 'Network access not permitted for this plugin',
            code: 'forbidden'
          };
        }
        return await runPluginFetch(allow, url, options);
      } catch (e) {
        logger.warn('plugins', 'plugins:fetch failed', e);
        return { success: false, error: pickError(e) };
      }
    }
  );
}
