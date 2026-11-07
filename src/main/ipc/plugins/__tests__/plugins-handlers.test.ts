import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  showOpenDialog: vi.fn(),
  rm: vi.fn(),
  fromWebContents: vi.fn(),
  getFocusedWindow: vi.fn(),
  getAllWindows: vi.fn(),
  loggerWarn: vi.fn(),
  errMsg: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  validatePluginId: vi.fn(),
  isWithin: vi.fn(),
  writeStorageFile: vi.fn(),
  validStorageKey: vi.fn(),
  sanitizeStoredObject: vi.fn(),
  pluginSettingValueValid: vi.fn(),
  pluginConsentHash: vi.fn(),
  sha256Hex: vi.fn(),
  pluginApprovalMatches: vi.fn(),
  runPluginFetch: vi.fn(),
  settingWriteAllowed: vi.fn(),
  storagePermissionGranted: vi.fn(),
  installPluginFromDir: vi.fn(),
  listPluginExamples: vi.fn(),
  getPluginsDir: vi.fn(),
  getPluginsDataDir: vi.fn(),
  getExamplesDir: vi.fn(),
  pluginStorageFile: vi.fn(),
  pluginSettingsFile: vi.fn(),
  readManifest: vi.fn(),
  readManifestById: vi.fn(),
  readPluginEntry: vi.fn(),
  readEntryDigest: vi.fn(),
  approvedManifest: vi.fn(),
  listInstalledPlugins: vi.fn(),
  loadEnabledState: vi.fn(),
  setEnabled: vi.fn(),
  mergeInfos: vi.fn(),
  storageData: vi.fn(),
  settingsData: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.handlers[channel] = fn;
    }
  },
  dialog: { showOpenDialog: state.showOpenDialog },
  BrowserWindow: {
    fromWebContents: state.fromWebContents,
    getFocusedWindow: state.getFocusedWindow,
    getAllWindows: state.getAllWindows
  }
}));
vi.mock('fs/promises', () => ({ rm: state.rm }));
vi.mock('path', () => ({ join: (...parts: string[]) => parts.join('/') }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../../../shared/helpers', () => ({ errMsg: state.errMsg }));
vi.mock('../plugins-core', () => ({
  validatePluginId: state.validatePluginId,
  isWithin: state.isWithin,
  writeStorageFile: state.writeStorageFile,
  validStorageKey: state.validStorageKey,
  sanitizeStoredObject: state.sanitizeStoredObject,
  pluginSettingValueValid: state.pluginSettingValueValid,
  pluginConsentHash: state.pluginConsentHash,
  sha256Hex: state.sha256Hex,
  pluginApprovalMatches: state.pluginApprovalMatches,
  pluginDataLock: (fn: () => unknown) => fn(),
  MAX_STORAGE_KEYS: 2
}));
vi.mock('../plugins-fetch', () => ({ runPluginFetch: state.runPluginFetch }));
vi.mock('../plugins-guards', () => ({
  settingWriteAllowed: state.settingWriteAllowed,
  storagePermissionGranted: state.storagePermissionGranted
}));
vi.mock('../plugins-examples', () => ({
  installPluginFromDir: state.installPluginFromDir,
  listPluginExamples: state.listPluginExamples
}));
vi.mock('../plugins-store', () => ({
  getPluginsDir: state.getPluginsDir,
  getPluginsDataDir: state.getPluginsDataDir,
  getExamplesDir: state.getExamplesDir,
  pluginStorageFile: state.pluginStorageFile,
  pluginSettingsFile: state.pluginSettingsFile,
  readManifest: state.readManifest,
  readManifestById: state.readManifestById,
  readPluginEntry: state.readPluginEntry,
  readEntryDigest: state.readEntryDigest,
  approvedManifest: state.approvedManifest,
  listInstalledPlugins: state.listInstalledPlugins,
  loadEnabledState: state.loadEnabledState,
  setEnabled: state.setEnabled,
  mergeInfos: state.mergeInfos,
  storageData: state.storageData,
  settingsData: state.settingsData
}));

async function load() {
  vi.resetModules();
  const module = await import('../plugins-handlers');
  module.registerPluginsHandlers();
  return state.handlers;
}

const manifest = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'p1',
    name: 'Plugin',
    version: '1.0.0',
    permissions: { storage: true, network: { allow: ['https://api.example'] } },
    settings: [{ key: 'theme', type: 'text', label: 'Theme', default: 'dark' }],
    ...overrides
  }) as any;

beforeEach(() => {
  state.handlers = {};
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && 'mockReset' in value) {
      (value as { mockReset: () => void }).mockReset();
    }
  }
  state.errMsg.mockImplementation((e: unknown) => (e instanceof Error ? e.message : String(e)));
  state.validatePluginId.mockReturnValue(true);
  state.isWithin.mockReturnValue(true);
  state.validStorageKey.mockReturnValue(true);
  state.sanitizeStoredObject.mockImplementation((obj: unknown) => obj);
  state.pluginSettingValueValid.mockReturnValue(true);
  state.pluginApprovalMatches.mockReturnValue(true);
  state.storagePermissionGranted.mockReturnValue(true);
  state.settingWriteAllowed.mockReturnValue(true);
  state.getPluginsDir.mockReturnValue('C:/plugins');
  state.getPluginsDataDir.mockReturnValue('C:/data');
  state.getExamplesDir.mockReturnValue('C:/examples');
  state.pluginStorageFile.mockImplementation((id: string) => `C:/plugins/${id}/storage.json`);
  state.pluginSettingsFile.mockImplementation((id: string) => `C:/plugins/${id}/settings.json`);
  state.readManifestById.mockResolvedValue(manifest());
  state.readManifest.mockResolvedValue(manifest());
  state.readPluginEntry.mockResolvedValue('code()');
  state.readEntryDigest.mockResolvedValue('digest');
  state.approvedManifest.mockResolvedValue(manifest());
  state.listInstalledPlugins.mockResolvedValue([manifest()]);
  state.loadEnabledState.mockResolvedValue({ p1: true });
  state.mergeInfos.mockResolvedValue([{ id: 'p1', enabled: true }]);
  state.storageData.mockResolvedValue({ a: 1, b: 2 });
  state.settingsData.mockResolvedValue({ theme: 'dark' });
  state.pluginConsentHash.mockReturnValue('consent');
  state.sha256Hex.mockReturnValue('sha');
  state.listPluginExamples.mockResolvedValue([{ id: 'ex1' }, { id: 'ex2' }]);
  state.installPluginFromDir.mockResolvedValue({
    success: true,
    installed: { id: 'p1', name: 'Plugin' }
  });
  state.setEnabled.mockResolvedValue(undefined);
  state.runPluginFetch.mockResolvedValue({ success: true, status: 200 });
  state.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/folder/My Plugin/'] });
  state.fromWebContents.mockReturnValue({ id: 1 });
  state.getFocusedWindow.mockReturnValue(null);
  state.getAllWindows.mockReturnValue([]);
  state.rm.mockResolvedValue(undefined);
  state.writeStorageFile.mockResolvedValue(undefined);
});

describe('registration and listing', () => {
  it('registers every plugins channel', async () => {
    const handlers = await load();
    expect(Object.keys(handlers).sort()).toEqual(
      [
        'plugins:list',
        'plugins:listExamples',
        'plugins:installExample',
        'plugins:get',
        'plugins:toggle',
        'plugins:uninstall',
        'plugins:installFromFolder',
        'plugins:storage:keys',
        'plugins:storage:get',
        'plugins:storage:set',
        'plugins:storage:remove',
        'plugins:settings:get',
        'plugins:settings:set',
        'plugins:fetch'
      ].sort()
    );
  });

  it('lists installed plugins and examples with fallbacks', async () => {
    const handlers = await load();
    await expect(handlers['plugins:list']()).resolves.toEqual([{ id: 'p1', enabled: true }]);
    await expect(handlers['plugins:listExamples']()).resolves.toEqual([
      { id: 'ex1' },
      { id: 'ex2' }
    ]);

    state.listInstalledPlugins.mockRejectedValueOnce(new Error('list'));
    state.listPluginExamples.mockRejectedValueOnce(new Error('examples'));
    await expect(handlers['plugins:list']()).resolves.toEqual([]);
    await expect(handlers['plugins:listExamples']()).resolves.toEqual([]);
    expect(state.loggerWarn).toHaveBeenCalledTimes(2);
  });
});

describe('installExample', () => {
  it('rejects invalid and unknown examples', async () => {
    const handlers = await load();
    state.validatePluginId.mockReturnValueOnce(false);
    await expect(handlers['plugins:installExample']({}, 'bad')).resolves.toEqual({
      success: false,
      error: 'Invalid plugin id'
    });

    await expect(handlers['plugins:installExample']({}, 'missing')).resolves.toEqual({
      success: false,
      error: 'Unknown example'
    });
  });

  it('installs, disables and merges the example plugin', async () => {
    const handlers = await load();
    const result = await handlers['plugins:installExample']({}, 'ex1');

    expect(state.installPluginFromDir).toHaveBeenCalledWith('C:/examples/ex1', 'C:/plugins', 'ex1');
    expect(state.setEnabled).toHaveBeenCalledWith('ex1', false, null);
    expect(result).toEqual({ success: true, installed: { id: 'p1', enabled: true } });
  });

  it('returns installer failures and catches exceptions', async () => {
    const handlers = await load();
    state.installPluginFromDir.mockResolvedValueOnce({ success: false, error: 'bad plugin' });
    await expect(handlers['plugins:installExample']({}, 'ex1')).resolves.toEqual({
      success: false,
      error: 'bad plugin'
    });

    state.installPluginFromDir.mockRejectedValueOnce(new Error('boom'));
    await expect(handlers['plugins:installExample']({}, 'ex1')).resolves.toEqual({
      success: false,
      error: 'boom'
    });
  });
});

describe('get and toggle', () => {
  it('returns plugin code with a consent hash', async () => {
    const handlers = await load();
    const result = await handlers['plugins:get']({}, 'p1');
    expect(result).toEqual({
      success: true,
      manifest: manifest(),
      code: 'code()',
      consentHash: 'consent'
    });
    expect(state.sha256Hex).toHaveBeenCalledWith('code()');
    expect(state.pluginConsentHash).toHaveBeenCalledWith(manifest(), 'sha');
  });

  it('handles invalid ids, missing manifests and entries', async () => {
    const handlers = await load();
    state.validatePluginId.mockReturnValueOnce(false);
    await expect(handlers['plugins:get']({}, 'x')).resolves.toEqual({
      success: false,
      error: 'Invalid plugin id'
    });

    state.readManifest.mockResolvedValueOnce(null);
    await expect(handlers['plugins:get']({}, 'p1')).resolves.toEqual({
      success: false,
      error: 'Plugin not found'
    });

    state.readPluginEntry.mockResolvedValueOnce(null);
    await expect(handlers['plugins:get']({}, 'p1')).resolves.toEqual({
      success: false,
      error: 'Entry file missing'
    });

    state.readManifest.mockRejectedValueOnce(new Error('disk'));
    await expect(handlers['plugins:get']({}, 'p1')).resolves.toEqual({
      success: false,
      error: 'disk'
    });
  });

  it('enables only approved plugins and disables others', async () => {
    const handlers = await load();
    await expect(handlers['plugins:toggle']({}, 'p1', true, 'consent')).resolves.toBe(true);
    expect(state.pluginApprovalMatches).toHaveBeenCalledWith(manifest(), 'digest', 'consent');
    expect(state.setEnabled).toHaveBeenCalledWith('p1', true, 'consent');

    await expect(handlers['plugins:toggle']({}, 'p1', false)).resolves.toBe(true);
    expect(state.setEnabled).toHaveBeenLastCalledWith('p1', false);
  });

  it('rejects invalid toggle requests', async () => {
    const handlers = await load();
    state.validatePluginId.mockReturnValueOnce(false);
    await expect(handlers['plugins:toggle']({}, 'bad', true)).resolves.toBe(false);

    state.readManifestById.mockResolvedValueOnce(null);
    await expect(handlers['plugins:toggle']({}, 'p1', true)).resolves.toBe(false);

    state.readEntryDigest.mockResolvedValueOnce(null);
    await expect(handlers['plugins:toggle']({}, 'p1', true)).resolves.toBe(false);

    state.pluginApprovalMatches.mockReturnValueOnce(false);
    await expect(handlers['plugins:toggle']({}, 'p1', true)).resolves.toBe(false);

    state.readManifestById.mockRejectedValueOnce(new Error('db'));
    await expect(handlers['plugins:toggle']({}, 'p1', true)).resolves.toBe(false);
  });
});

describe('uninstall and installFromFolder', () => {
  it('removes plugin directories and state', async () => {
    const handlers = await load();
    await expect(handlers['plugins:uninstall']({}, 'p1')).resolves.toEqual({ success: true });

    expect(state.rm).toHaveBeenCalledWith('C:/plugins/p1', { recursive: true, force: true });
    expect(state.rm).toHaveBeenCalledWith('C:/plugins/p1/storage.json', { force: true });
    expect(state.rm).toHaveBeenCalledWith('C:/plugins/p1/settings.json', { force: true });
    expect(state.rm).toHaveBeenCalledWith('C:/data/p1', { recursive: true, force: true });
    expect(state.setEnabled).toHaveBeenCalledWith('p1', false);
  });

  it('skips deleting paths outside the plugins directory', async () => {
    const handlers = await load();
    state.isWithin.mockReturnValueOnce(false);
    await handlers['plugins:uninstall']({}, 'p1');
    expect(state.rm).not.toHaveBeenCalledWith('C:/plugins/p1', {
      recursive: true,
      force: true
    });
  });

  it('handles invalid ids and uninstall failures', async () => {
    const handlers = await load();
    state.validatePluginId.mockReturnValueOnce(false);
    await expect(handlers['plugins:uninstall']({}, 'x')).resolves.toEqual({
      success: false,
      error: 'Invalid plugin id'
    });

    state.rm.mockRejectedValueOnce(new Error('locked'));
    await expect(handlers['plugins:uninstall']({}, 'p1')).resolves.toEqual({
      success: false,
      error: 'locked'
    });
  });

  it('installs from a chosen folder and disables the plugin', async () => {
    const handlers = await load();
    const sender = { id: 7 };
    const result = await handlers['plugins:installFromFolder']({ sender });

    expect(state.showOpenDialog).toHaveBeenCalledWith({ id: 1 }, { properties: ['openDirectory'] });
    expect(state.installPluginFromDir).toHaveBeenCalledWith(
      'C:/folder/My Plugin/',
      'C:/plugins',
      'My Plugin'
    );
    expect(state.setEnabled).toHaveBeenCalledWith('p1', false, null);
    expect(result).toEqual({ success: true, installed: { id: 'p1', enabled: true } });
  });

  it('uses a windowless dialog when no parent is available', async () => {
    const handlers = await load();
    state.fromWebContents.mockReturnValue(null);
    state.getFocusedWindow.mockReturnValue(null);
    state.getAllWindows.mockReturnValue([]);
    await handlers['plugins:installFromFolder']({ sender: {} });
    expect(state.showOpenDialog).toHaveBeenCalledWith({ properties: ['openDirectory'] });
  });

  it('handles cancelled dialogs, install failures and exceptions', async () => {
    const handlers = await load();
    state.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await expect(handlers['plugins:installFromFolder']({ sender: {} })).resolves.toEqual({
      success: false,
      error: 'cancelled'
    });

    state.installPluginFromDir.mockResolvedValueOnce({ success: false, error: 'bad zip' });
    await expect(handlers['plugins:installFromFolder']({ sender: {} })).resolves.toEqual({
      success: false,
      error: 'bad zip'
    });

    state.installPluginFromDir.mockRejectedValueOnce(new Error('crash'));
    await expect(handlers['plugins:installFromFolder']({ sender: {} })).resolves.toEqual({
      success: false,
      error: 'crash'
    });
  });
});

describe('plugin storage', () => {
  it('returns keys only with permission', async () => {
    const handlers = await load();
    await expect(handlers['plugins:storage:keys']({}, 'p1')).resolves.toEqual(['a', 'b']);

    state.approvedManifest.mockResolvedValueOnce(null);
    await expect(handlers['plugins:storage:keys']({}, 'p1')).resolves.toEqual([]);

    state.storagePermissionGranted.mockReturnValueOnce(false);
    state.approvedManifest.mockResolvedValueOnce(manifest());
    await expect(handlers['plugins:storage:keys']({}, 'p1')).resolves.toEqual([]);

    state.approvedManifest.mockRejectedValueOnce(new Error('read'));
    await expect(handlers['plugins:storage:keys']({}, 'p1')).resolves.toEqual([]);
  });

  it('gets stored values safely', async () => {
    const handlers = await load();
    await expect(handlers['plugins:storage:get']({}, 'p1', 'a')).resolves.toBe(1);
    await expect(handlers['plugins:storage:get']({}, 'p1', 'missing')).resolves.toBeNull();

    state.validStorageKey.mockReturnValueOnce(false);
    await expect(handlers['plugins:storage:get']({}, 'p1', 'bad')).resolves.toBeNull();

    state.approvedManifest.mockResolvedValueOnce(null);
    await expect(handlers['plugins:storage:get']({}, 'p1', 'a')).resolves.toBeNull();

    state.approvedManifest.mockRejectedValueOnce(new Error('db'));
    await expect(handlers['plugins:storage:get']({}, 'p1', 'a')).resolves.toBeNull();
  });

  it('sets storage with permissions, key cap and sanitisation', async () => {
    const handlers = await load();
    await expect(handlers['plugins:storage:set']({}, 'p1', 'a', 9)).resolves.toBe(true);
    expect(state.writeStorageFile).toHaveBeenLastCalledWith('C:/plugins/p1/storage.json', {
      a: 9,
      b: 2
    });

    // New key with the cap already reached.
    await expect(handlers['plugins:storage:set']({}, 'p1', 'c', 3)).resolves.toBe(false);

    state.storageData.mockResolvedValueOnce({ a: 1 });
    await expect(handlers['plugins:storage:set']({}, 'p1', 'b', 2)).resolves.toBe(true);
    expect(state.writeStorageFile).toHaveBeenLastCalledWith('C:/plugins/p1/storage.json', {
      a: 1,
      b: 2
    });
  });

  it('rejects invalid storage writes', async () => {
    const handlers = await load();
    state.approvedManifest.mockResolvedValueOnce(null);
    await expect(handlers['plugins:storage:set']({}, 'p1', 'x', 1)).resolves.toBe(false);

    state.storagePermissionGranted.mockReturnValueOnce(false);
    await expect(handlers['plugins:storage:set']({}, 'p1', 'x', 1)).resolves.toBe(false);

    state.validStorageKey.mockReturnValueOnce(false);
    await expect(handlers['plugins:storage:set']({}, 'p1', 'bad', 1)).resolves.toBe(false);

    state.sanitizeStoredObject.mockReturnValueOnce({});
    await expect(handlers['plugins:storage:set']({}, 'p1', 'a', 1)).resolves.toBe(false);

    state.writeStorageFile.mockRejectedValueOnce(new Error('disk'));
    await expect(handlers['plugins:storage:set']({}, 'p1', 'a', 1)).resolves.toBe(false);
  });

  it('removes storage keys', async () => {
    const handlers = await load();
    await expect(handlers['plugins:storage:remove']({}, 'p1', 'a')).resolves.toBe(true);
    expect(state.writeStorageFile).toHaveBeenLastCalledWith('C:/plugins/p1/storage.json', { b: 2 });

    state.writeStorageFile.mockClear();
    await expect(handlers['plugins:storage:remove']({}, 'p1', 'missing')).resolves.toBe(true);
    expect(state.writeStorageFile).not.toHaveBeenCalled();

    state.approvedManifest.mockResolvedValueOnce(null);
    await expect(handlers['plugins:storage:remove']({}, 'p1', 'a')).resolves.toBe(false);

    state.storagePermissionGranted.mockReturnValueOnce(false);
    await expect(handlers['plugins:storage:remove']({}, 'p1', 'a')).resolves.toBe(false);

    state.validStorageKey.mockReturnValueOnce(false);
    await expect(handlers['plugins:storage:remove']({}, 'p1', 'bad')).resolves.toBe(false);

    state.writeStorageFile.mockRejectedValueOnce(new Error('disk'));
    await expect(handlers['plugins:storage:remove']({}, 'p1', 'a')).resolves.toBe(false);
  });
});

describe('plugin settings and fetch', () => {
  it('reads settings with migration data', async () => {
    const handlers = await load();
    await expect(handlers['plugins:settings:get']({}, 'p1')).resolves.toEqual({ theme: 'dark' });
    expect(state.settingsData).toHaveBeenCalledWith('p1', manifest());

    state.validatePluginId.mockReturnValueOnce(false);
    await expect(handlers['plugins:settings:get']({}, 'bad')).resolves.toEqual({});

    state.readManifestById.mockRejectedValueOnce(new Error('db'));
    await expect(handlers['plugins:settings:get']({}, 'p1')).resolves.toEqual({});
  });

  it('validates and writes declared settings', async () => {
    const handlers = await load();
    await expect(handlers['plugins:settings:set']({}, 'p1', 'theme', 'light')).resolves.toBe(true);
    expect(state.pluginSettingValueValid).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'theme' }),
      'light'
    );
    expect(state.settingWriteAllowed).toHaveBeenCalledWith(
      manifest().permissions,
      ['theme'],
      'theme'
    );
    expect(state.writeStorageFile).toHaveBeenCalledWith('C:/plugins/p1/settings.json', {
      theme: 'light'
    });
  });

  it('rejects invalid settings writes', async () => {
    const handlers = await load();
    state.approvedManifest.mockResolvedValueOnce(null);
    await expect(handlers['plugins:settings:set']({}, 'p1', 'theme', 'x')).resolves.toBe(false);

    state.validStorageKey.mockReturnValueOnce(false);
    await expect(handlers['plugins:settings:set']({}, 'p1', 'bad', 'x')).resolves.toBe(false);

    await expect(handlers['plugins:settings:set']({}, 'p1', 'unknown', 'x')).resolves.toBe(false);

    state.pluginSettingValueValid.mockReturnValueOnce(false);
    await expect(handlers['plugins:settings:set']({}, 'p1', 'theme', 'bad')).resolves.toBe(false);

    state.settingWriteAllowed.mockReturnValueOnce(false);
    await expect(handlers['plugins:settings:set']({}, 'p1', 'theme', 'x')).resolves.toBe(false);

    state.sanitizeStoredObject.mockReturnValueOnce({});
    await expect(handlers['plugins:settings:set']({}, 'p1', 'theme', 'x')).resolves.toBe(false);

    state.writeStorageFile.mockRejectedValueOnce(new Error('disk'));
    await expect(handlers['plugins:settings:set']({}, 'p1', 'theme', 'x')).resolves.toBe(false);
  });

  it('forwards network fetches only with an allowlist', async () => {
    const handlers = await load();
    await expect(
      handlers['plugins:fetch']({}, 'p1', 'https://api.example/x', { method: 'GET' })
    ).resolves.toEqual({ success: true, status: 200 });
    expect(state.runPluginFetch).toHaveBeenCalledWith(
      ['https://api.example'],
      'https://api.example/x',
      { method: 'GET' }
    );

    state.approvedManifest.mockResolvedValueOnce(null);
    await expect(handlers['plugins:fetch']({}, 'p1', 'https://x', {})).resolves.toEqual({
      success: false,
      error: 'Network access not permitted for this plugin',
      code: 'forbidden'
    });

    state.approvedManifest.mockResolvedValueOnce(manifest({ permissions: {} }));
    await expect(handlers['plugins:fetch']({}, 'p1', 'https://x', {})).resolves.toMatchObject({
      success: false,
      code: 'forbidden'
    });

    state.approvedManifest.mockRejectedValueOnce(new Error('manifest'));
    await expect(handlers['plugins:fetch']({}, 'p1', 'https://x', {})).resolves.toEqual({
      success: false,
      error: 'manifest'
    });
  });
});
