import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import { join, sep, resolve } from 'path';
import {
  readdir,
  readFile,
  mkdir,
  stat,
  cp,
  rm
} from 'fs/promises';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import type {
  PluginInfo,
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
  urlAllowed,
  resolveRedirectUrl,
  MAX_MANIFEST_BYTES,
  MAX_ENTRY_BYTES,
  MAX_PLUGINS,
  MAX_STORAGE_KEYS,
  MAX_FETCH_BYTES,
  MAX_FETCH_TEXT_BYTES,
  MAX_FETCH_REDIRECTS,
  DEFAULT_FETCH_TIMEOUT_MS,
  MAX_FETCH_TIMEOUT_MS
} from './plugins-core';
import type { PluginStateFile } from './plugins-core';

let pluginsDir: string | null = null;
let pluginsDataDir: string | null = null;

function getPluginsDir(): string {
  if (!pluginsDir) pluginsDir = join(app.getPath('userData'), 'plugins');
  return pluginsDir;
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
    permissions: manifest.permissions
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

function loadEnabledState(): Promise<PluginStateFile> {
  return loadStateFile(stateFilePath());
}

async function setEnabled(id: string, enabled: boolean): Promise<void> {
  const state = await loadEnabledState();
  state[id] = { enabled };
  await saveStateFile(stateFilePath(), state);
}

function mergeInfos(plugins: PluginInfo[], state: PluginStateFile): PluginInfo[] {
  return plugins.map((p) => ({ ...p, enabled: state[p.id]?.enabled === true }));
}

async function storageData(id: string): Promise<Record<string, unknown>> {
  const base = getPluginsDataDir();
  await mkdir(join(base, id), { recursive: true });
  return readStorageFile(pluginStorageFile(id));
}

async function settingsData(id: string): Promise<Record<string, unknown>> {
  const base = getPluginsDataDir();
  await mkdir(join(base, id), { recursive: true });
  return readStorageFile(pluginSettingsFile(id));
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

function fetchRequest(
  url: string,
  opts: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
  },
  onRedirect: (next: string) => boolean,
  redirectsLeft = MAX_FETCH_REDIRECTS
): Promise<{ status: number; statusText: string; headers: Record<string, string>; text: string }> {
  return new Promise((resolvePromise, reject) => {
    const transport = url.startsWith('https:') ? httpsRequest : httpRequest;
    const req = transport(
      url,
      {
        method: opts.method,
        headers: { 'User-Agent': 'Onda-plugin/1.0', ...opts.headers }
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject({ code: 'redirect-loop', message: 'Too many redirects' });
            return;
          }
          const next = resolveRedirectUrl(url, res.headers.location);
          if (!next || !onRedirect(next)) {
            reject({ code: 'redirect-loop', message: 'Redirect not allowed' });
            return;
          }
          fetchRequest(next, opts, onRedirect, redirectsLeft - 1).then(resolvePromise, reject);
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_FETCH_BYTES) {
            req.destroy();
            reject({ code: 'too-large', message: 'Response too large' });
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolvePromise({
            status,
            statusText: res.statusMessage || '',
            headers: res.headers as Record<string, string>,
            text: Buffer.concat(chunks).toString('utf-8')
          });
        });
        res.on('error', (e) => reject({ code: 'network', message: e.message }));
      }
    );
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy();
      reject({ code: 'timeout', message: 'Timeout' });
    });
    req.on('error', (e) => reject({ code: 'network', message: e.message }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function runPluginFetch(
  id: string,
  url: string,
  options: PluginFetchOptions
): Promise<PluginFetchResult> {
  const plugins = await listInstalledPlugins();
  const info = plugins.find((p) => p.id === id);
  const allow = info?.permissions.network?.allow || [];
  if (!info || allow.length === 0) {
    return { success: false, error: 'Network access not permitted for this plugin', code: 'forbidden' };
  }
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return { success: false, error: 'Invalid method', code: 'invalid-url' };
  }
  if (!urlAllowed(url, allow)) {
    return { success: false, error: 'URL not permitted by plugin allowlist', code: 'forbidden' };
  }
  const requestedTimeout = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_FETCH_TIMEOUT_MS;
  const timeoutMs = Math.min(requestedTimeout, MAX_FETCH_TIMEOUT_MS);
  try {
    const result = await fetchRequest(
      url,
      {
        method,
        headers: options.headers || {},
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        timeoutMs
      },
      (next) => urlAllowed(next, allow)
    );
    if (result.text.length > MAX_FETCH_TEXT_BYTES) {
      return { success: false, error: 'Response too large', code: 'too-large' };
    }
    let data: unknown = result.text;
    if (options.responseType === 'json') {
      try {
        data = result.text ? JSON.parse(result.text) : null;
      } catch {
        return { success: false, error: 'Invalid JSON response', code: 'unknown' };
      }
    }
    return {
      success: true,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      data
    };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return {
      success: false,
      error: err.message || String(e),
      code: (err.code as PluginFetchResult['code']) || 'unknown'
    };
  }
}

async function installFromFolder(): Promise<IpcPluginInstallResult> {
  const win = getParentWindow();
  const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) {
    return { success: false, error: 'cancelled' };
  }
  const source = result.filePaths[0];
  const sourceId = source.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
  const base = getPluginsDir();
  await mkdir(base, { recursive: true });
  const { manifest, error } = parseManifest(
    JSON.parse(await readFile(join(source, 'manifest.json'), 'utf-8')),
    sourceId
  );
  if (error || !manifest.id) {
    return { success: false, error: error === 'manifest:not-object' ? 'Invalid manifest' : error || 'Invalid manifest' };
  }
  if (!validatePluginId(manifest.id)) return { success: false, error: 'Invalid plugin id (folder name must match [a-z0-9._-]+)' };
  const entryPath = resolve(source, manifest.entry);
  if (!isWithin(source, entryPath)) return { success: false, error: 'Entry outside plugin folder' };
  let entryExists = false;
  try {
    entryExists = (await stat(entryPath)).isFile();
  } catch {
    entryExists = false;
  }
  if (!entryExists) return { success: false, error: 'Entry file missing' };
  const dest = join(base, manifest.id);
  await rm(dest, { recursive: true, force: true });
  await cp(source, dest, {
    recursive: true,
    filter: (src) => !src.includes(`${sep}node_modules${sep}`) && !src.endsWith(`${sep}node_modules`)
  });
  await setEnabled(manifest.id, true);
  const info = await readManifestSafe(dest);
  if (!info) return { success: false, error: 'Installed plugin invalid' };
  const enabled = await loadEnabledState();
  return { success: true, installed: mergeInfos([info], enabled)[0] };
}

export function registerPluginsHandlers(): void {
  ipcMain.handle('plugins:list', async (): Promise<PluginInfo[]> => {
    try {
      const plugins = await listInstalledPlugins();
      return mergeInfos(plugins, await loadEnabledState());
    } catch (e) {
      logger.warn('plugins', 'plugins:list failed', e);
      return [];
    }
  });

  ipcMain.handle('plugins:get', async (_e, id: string): Promise<IpcPluginGetResult> => {
    try {
      if (!validatePluginId(id)) return { success: false, error: 'Invalid plugin id' };
      const dir = join(getPluginsDir(), id);
      const manifest = await readManifest(dir, id);
      if (!manifest) return { success: false, error: 'Plugin not found' };
      const code = await readPluginEntry(dir, id);
      if (code === null) return { success: false, error: 'Entry file missing' };
      return { success: true, manifest, code };
    } catch (e) {
      logger.warn('plugins', 'plugins:get failed', e);
      return { success: false, error: pickError(e) };
    }
  });

  ipcMain.handle('plugins:toggle', async (_e, id: string, enabled: boolean): Promise<boolean> => {
    try {
      if (!validatePluginId(id)) return false;
      await setEnabled(id, enabled === true);
      return true;
    } catch (e) {
      logger.warn('plugins', 'plugins:toggle failed', e);
      return false;
    }
  });

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
      if (!validatePluginId(id)) return [];
      return Object.keys(await storageData(id));
    } catch (e) {
      logger.warn('plugins', 'plugins:storage:keys failed', e);
      return [];
    }
  });

  ipcMain.handle('plugins:storage:get', async (_e, id: string, key: string): Promise<unknown> => {
    try {
      if (!validatePluginId(id) || !validStorageKey(key)) return null;
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
        if (!validatePluginId(id) || !validStorageKey(key)) return false;
        const current = await storageData(id);
        if (!Object.prototype.hasOwnProperty.call(current, key) && Object.keys(current).length >= MAX_STORAGE_KEYS) {
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

  ipcMain.handle('plugins:storage:remove', async (_e, id: string, key: string): Promise<boolean> => {
    try {
      if (!validatePluginId(id) || !validStorageKey(key)) return false;
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
  });

  ipcMain.handle('plugins:settings:get', async (_e, id: string): Promise<Record<string, unknown>> => {
    try {
      if (!validatePluginId(id)) return {};
      return await settingsData(id);
    } catch (e) {
      logger.warn('plugins', 'plugins:settings:get failed', e);
      return {};
    }
  });

  ipcMain.handle(
    'plugins:settings:set',
    async (_e, id: string, key: string, value: unknown): Promise<boolean> => {
      try {
        if (!validatePluginId(id) || !validStorageKey(key)) return false;
        const next: Record<string, unknown> = { ...(await settingsData(id)), [key]: value };
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
    async (_e, id: string, url: string, options: PluginFetchOptions): Promise<PluginFetchResult> => {
      try {
        return await runPluginFetch(id, url, options);
      } catch (e) {
        logger.warn('plugins', 'plugins:fetch failed', e);
        return { success: false, error: pickError(e) };
      }
    }
  );
}