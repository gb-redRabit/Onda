import { beforeEach, describe, expect, it, vi } from 'vitest';

// Handlery ustawień: store, szyfrowanie, dialogi i efekty uboczne są podstawione.
const state = vi.hoisted(() => {
  class SecretStorageUnavailableError extends Error {}
  return {
    SecretStorageUnavailableError,
    handlers: new Map<string, (...args: any[]) => any>(),
    store: { store: {} as Record<string, unknown>, set: vi.fn() },
    data: {} as Record<string, unknown>,
    stored: {} as Record<string, unknown>,
    payload: {} as Record<string, unknown>,
    storedSanitized: {} as Record<string, unknown>,
    nextSanitized: null as Record<string, unknown> | null,
    dropped: [] as string[],
    getStore: vi.fn(),
    sanitize: vi.fn(),
    encryptionStatus: vi.fn(() => ({ available: true })),
    encryptApiKeys: vi.fn((keys: unknown) => ({ encrypted: keys })),
    decryptApiKeys: vi.fn((keys: unknown) => ({ decrypted: keys })),
    maskApiKeys: vi.fn((keys: unknown) => ({ masked: keys })),
    mergeApiKeys: vi.fn((incoming: unknown, stored: unknown) => ({ incoming, stored })),
    encryptProxy: vi.fn(),
    maskProxy: vi.fn(),
    restoreProxy: vi.fn(),
    stripProxy: vi.fn(),
    applyCoverCache: vi.fn(),
    isResetting: vi.fn(() => false),
    configureAutoCheck: vi.fn(),
    applyLogSettings: vi.fn(),
    syncSubscriptions: vi.fn(),
    syncLinkSubs: vi.fn(),
    setCloseToTray: vi.fn(),
    refreshTray: vi.fn(),
    setMainLocale: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    saveDialog: vi.fn(),
    openDialog: vi.fn(),
    fromWebContents: vi.fn(),
    allWindows: [] as any[],
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    }
  },
  dialog: { showSaveDialog: state.saveDialog, showOpenDialog: state.openDialog },
  BrowserWindow: {
    fromWebContents: state.fromWebContents,
    getAllWindows: () => state.allWindows
  }
}));
vi.mock('fs/promises', () => ({ writeFile: state.writeFile, readFile: state.readFile }));
vi.mock('../cover/cover-cache', () => ({
  getStore: state.getStore,
  applyCoverCacheSettings: state.applyCoverCache
}));
vi.mock('../factory-reset', () => ({ isResetting: state.isResetting }));
vi.mock('../../updater-scheduler', () => ({ configureAutoCheck: state.configureAutoCheck }));
vi.mock('../../log-file', () => ({ applyLogSettings: state.applyLogSettings }));
vi.mock('../settings/settings-schema', () => ({ sanitizeSettings: state.sanitize }));
vi.mock('../settings/settings-crypto', () => ({
  encryptApiKeys: state.encryptApiKeys,
  decryptApiKeys: state.decryptApiKeys,
  maskApiKeys: state.maskApiKeys,
  mergeApiKeys: state.mergeApiKeys,
  encryptionStatus: state.encryptionStatus,
  SecretStorageUnavailableError: state.SecretStorageUnavailableError
}));
vi.mock('../settings/settings-proxy', () => ({
  encryptProxyPasswords: state.encryptProxy,
  maskProxyPasswords: state.maskProxy,
  restoreProxyPasswords: state.restoreProxy,
  stripProxyPasswords: state.stripProxy
}));
vi.mock('../subscriptions/subscriptions-handlers', () => ({
  syncSubscriptionsScheduler: state.syncSubscriptions
}));
vi.mock('../providers/providers-handlers', () => ({
  syncLinkSubsScheduler: state.syncLinkSubs
}));
vi.mock('../../windows/close-behavior', () => ({ setCloseToTray: state.setCloseToTray }));
vi.mock('../../windows/tray', () => ({ refreshTray: state.refreshTray }));
vi.mock('../../i18n-main', () => ({ setMainLocale: state.setMainLocale }));
vi.mock('../../../shared/logger', () => ({ logger: state.logger }));

const { registerSettingsHandlers } = await import('../settings/settings-handlers');
registerSettingsHandlers();

function handler(channel: string): (...args: any[]) => any {
  const found = state.handlers.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

function window(id: number, destroyed = false) {
  return { isDestroyed: () => destroyed, webContents: { id, send: vi.fn() } };
}

function sender(id = 1) {
  return { sender: { id } };
}

beforeEach(() => {
  const stored = {};
  state.store.store = stored;
  state.store.set.mockClear();
  state.data = {};
  state.stored = stored;
  state.payload = {};
  state.storedSanitized = {};
  state.nextSanitized = null;
  state.dropped = [];
  state.getStore.mockReset();
  state.getStore.mockResolvedValue(state.store);
  state.sanitize.mockReset();
  state.sanitize.mockImplementation((input: unknown) => {
    if (input === state.stored) return { sanitized: state.storedSanitized, droppedKeys: [] };
    return { sanitized: state.payload, droppedKeys: state.dropped };
  });
  state.encryptionStatus.mockClear();
  state.encryptApiKeys.mockClear();
  state.decryptApiKeys.mockClear();
  state.maskApiKeys.mockClear();
  state.mergeApiKeys.mockClear();
  state.encryptProxy.mockClear();
  state.maskProxy.mockClear();
  state.restoreProxy.mockClear();
  state.stripProxy.mockClear();
  state.applyCoverCache.mockClear();
  state.isResetting.mockReset();
  state.isResetting.mockReturnValue(false);
  state.configureAutoCheck.mockClear();
  state.applyLogSettings.mockClear();
  state.syncSubscriptions.mockClear();
  state.syncLinkSubs.mockClear();
  state.setCloseToTray.mockClear();
  state.refreshTray.mockClear();
  state.setMainLocale.mockClear();
  state.writeFile.mockReset();
  state.writeFile.mockResolvedValue(undefined);
  state.readFile.mockReset();
  state.saveDialog.mockReset();
  state.openDialog.mockReset();
  state.fromWebContents.mockReset();
  state.fromWebContents.mockReturnValue({ id: 1 });
  state.allWindows = [];
  state.logger.warn.mockClear();
  state.logger.error.mockClear();
});

describe('secret storage and get', () => {
  it('reports encryption status', () => {
    expect(handler('settings:secretStorageStatus')({})).toEqual({ available: true });
  });

  it('returns sanitized settings with masked secrets', async () => {
    state.store.store = { general: { locale: 'pl' }, apiKeys: { a: 'x' }, network: {} };
    state.stored = state.store.store;
    state.storedSanitized = {
      general: { locale: 'pl' },
      apiKeys: { a: 'x' },
      network: {}
    };

    const result = await handler('settings:get')({});

    expect(result).toEqual({
      general: { locale: 'pl' },
      apiKeys: { masked: { a: 'x' } },
      network: {}
    });
    expect(state.maskApiKeys).toHaveBeenCalledWith({ a: 'x' });
    expect(state.maskProxy).toHaveBeenCalledWith({});
  });

  it('returns an empty object when the store fails', async () => {
    state.getStore.mockRejectedValue(new Error('no store'));
    await expect(handler('settings:get')({})).resolves.toEqual({});
    expect(state.logger.warn).toHaveBeenCalled();
  });
});

describe('settings:set', () => {
  it('refuses late saves during a factory reset', async () => {
    state.isResetting.mockReturnValue(true);
    await expect(handler('settings:set')(sender(), {})).resolves.toBe(false);
    expect(state.getStore).not.toHaveBeenCalled();
  });

  it('persists sanitized values and applies side effects', async () => {
    state.data = { general: {}, library: {}, updates: {}, download: {} };
    state.payload = {
      general: { closeToTray: false, logLevel: 'debug', logMaxSizeMB: 5 },
      library: { coverCacheMaxEntries: 100 },
      updates: {},
      download: {},
      appearance: { locale: 'pl' }
    };
    state.storedSanitized = { appearance: { locale: 'en' } };
    state.nextSanitized = { appearance: { locale: 'pl' } };
    state.allWindows = [window(1), window(2), window(3, true)];
    const event = sender(1);

    await expect(handler('settings:set')(event, state.data)).resolves.toBe(true);

    expect(state.store.store).toMatchObject(state.payload);
    expect(state.setCloseToTray).toHaveBeenCalledWith(false);
    expect(state.applyLogSettings).toHaveBeenCalledWith('debug', 5);
    expect(state.applyCoverCache).toHaveBeenCalledWith(100);
    expect(state.configureAutoCheck).toHaveBeenCalled();
    expect(state.syncSubscriptions).toHaveBeenCalled();
    expect(state.syncLinkSubs).toHaveBeenCalled();
    expect(state.setMainLocale).toHaveBeenCalledWith('pl');
    expect(state.refreshTray).toHaveBeenCalled();
    expect(state.allWindows[1].webContents.send).toHaveBeenCalledWith('settings:appearance', {
      locale: 'pl'
    });
    expect(state.allWindows[0].webContents.send).not.toHaveBeenCalled();
    expect(state.allWindows[2].webContents.send).not.toHaveBeenCalled();
  });

  it('defaults closeToTray to enabled and skips appearance broadcasts', async () => {
    state.data = { general: {} };
    state.payload = { general: {}, appearance: { locale: 'pl' } };
    state.storedSanitized = { appearance: { locale: 'pl' } };
    state.nextSanitized = { appearance: { locale: 'pl' } };

    await handler('settings:set')(sender(), state.data);

    expect(state.setCloseToTray).toHaveBeenCalledWith(true);
    expect(state.setMainLocale).not.toHaveBeenCalled();
    expect(state.refreshTray).not.toHaveBeenCalled();
  });

  it('merges API keys and restores proxy passwords', async () => {
    state.data = { apiKeys: { a: 'new' }, network: {} };
    state.payload = { apiKeys: { a: 'new' }, network: {} };
    state.storedSanitized = { apiKeys: { a: 'old' }, network: { proxy: { password: 'x' } } };
    state.nextSanitized = {};

    await handler('settings:set')(sender(), state.data);

    expect(state.decryptApiKeys).toHaveBeenCalledWith({ a: 'old' });
    expect(state.mergeApiKeys).toHaveBeenCalledWith({ a: 'new' }, { decrypted: { a: 'old' } });
    expect(state.restoreProxy).toHaveBeenCalledWith({}, { proxy: { password: 'x' } });
    expect(state.encryptProxy).toHaveBeenCalledWith({});
  });

  it('drops API keys when secure storage is unavailable but saves the rest', async () => {
    state.data = { general: {}, apiKeys: { a: 'secret' } };
    state.payload = { general: {}, apiKeys: { a: 'secret' } };
    state.storedSanitized = {};
    state.nextSanitized = {};
    state.encryptApiKeys.mockImplementationOnce(() => {
      throw new state.SecretStorageUnavailableError();
    });

    await expect(handler('settings:set')(sender(), state.data)).resolves.toBe(false);

    expect(state.store.store).toMatchObject({ general: {} });
    expect(state.store.store.apiKeys).toBeUndefined();
  });

  it('logs dropped keys and returns false on unexpected errors', async () => {
    state.data = {};
    state.payload = {};
    state.dropped = ['bad', 'worse'];
    state.getStore.mockRejectedValue(new Error('disk'));

    await expect(handler('settings:set')(sender(), state.data)).resolves.toBe(false);

    expect(state.logger.warn).toHaveBeenCalledWith(
      'settings',
      expect.stringContaining('bad, worse')
    );
    expect(state.logger.warn).toHaveBeenCalledWith(
      'settings',
      'settings:set failed',
      expect.any(Error)
    );
  });
});

describe('export', () => {
  it('fails without a window', async () => {
    state.fromWebContents.mockReturnValue(null);
    await expect(handler('settings:export')(sender())).resolves.toEqual({
      success: false,
      error: 'No window'
    });
  });

  it('reports a canceled dialog', async () => {
    state.saveDialog.mockResolvedValue({ canceled: true });
    await expect(handler('settings:export')(sender())).resolves.toEqual({
      success: false,
      canceled: true
    });
  });

  it('writes settings without secrets', async () => {
    state.saveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/settings.json' });
    state.storedSanitized = {
      general: { locale: 'pl' },
      apiKeys: { a: 'x' },
      network: { proxy: { password: 'secret' } }
    };

    await expect(handler('settings:export')(sender())).resolves.toEqual({ success: true });

    expect(state.stripProxy).toHaveBeenCalledWith(state.storedSanitized.network);
    const written = JSON.parse(state.writeFile.mock.calls[0][1] as string);
    expect(written.apiKeys).toBeUndefined();
    expect(written.general).toEqual({ locale: 'pl' });
  });

  it('reports write errors', async () => {
    state.saveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/x.json' });
    state.writeFile.mockRejectedValue(new Error('readonly'));

    await expect(handler('settings:export')(sender())).resolves.toEqual({
      success: false,
      error: 'readonly'
    });
  });
});

describe('import', () => {
  it('fails without a window and when canceled', async () => {
    state.fromWebContents.mockReturnValue(null);
    await expect(handler('settings:import')(sender())).resolves.toEqual({
      success: false,
      error: 'No window'
    });

    state.fromWebContents.mockReturnValue({ id: 1 });
    state.openDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(handler('settings:import')(sender())).resolves.toEqual({
      success: false,
      canceled: true
    });
  });

  it('imports, encrypts and persists sanitized settings', async () => {
    state.openDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/import.json'] });
    state.readFile.mockResolvedValue('{"general":{}}');
    state.data = { general: {}, network: { proxy: {} }, apiKeys: { a: 'k' } };
    state.payload = {
      general: {},
      network: { proxy: {} },
      apiKeys: { a: 'k' }
    };

    const result = await handler('settings:import')(sender());

    expect(state.sanitize).toHaveBeenCalledWith({ general: {} });
    expect(state.stripProxy).toHaveBeenCalledWith({ proxy: {} });
    expect(state.encryptApiKeys).toHaveBeenCalledWith({ a: 'k' });
    expect(state.store.set).toHaveBeenCalledWith('general', {});
    expect(state.store.set).toHaveBeenCalledWith('apiKeys', { encrypted: { a: 'k' } });
    expect(state.setCloseToTray).toHaveBeenCalledWith(true);
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        apiKeys: { masked: { encrypted: { a: 'k' } } }
      })
    });
  });

  it('applies library/updates/download side effects and logs dropped keys', async () => {
    state.openDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/import.json'] });
    state.readFile.mockResolvedValue('{}');
    state.data = { library: {}, updates: {}, download: {}, general: {} };
    state.payload = { library: {}, updates: {}, download: {}, general: {} };
    state.dropped = ['bad'];

    await handler('settings:import')(sender());

    expect(state.applyCoverCache).toHaveBeenCalled();
    expect(state.configureAutoCheck).toHaveBeenCalled();
    expect(state.syncSubscriptions).toHaveBeenCalled();
    expect(state.syncLinkSubs).toHaveBeenCalled();
    expect(state.logger.warn).toHaveBeenCalledWith('settings', expect.stringContaining('bad'));
  });

  it('reports a partial import when keys cannot be stored', async () => {
    state.openDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/import.json'] });
    state.readFile.mockResolvedValue('{}');
    state.data = { general: {}, apiKeys: { a: 'k' } };
    state.payload = { general: {}, apiKeys: { a: 'k' } };
    state.encryptApiKeys.mockImplementationOnce(() => {
      throw new state.SecretStorageUnavailableError();
    });

    const result = await handler('settings:import')(sender());

    expect(result).toMatchObject({ success: false });
    expect(String(result.error)).toContain('API keys were skipped');
    expect(state.store.set).toHaveBeenCalledWith('general', {});
  });

  it('reports parse and read errors', async () => {
    state.openDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/import.json'] });
    state.readFile.mockResolvedValue('not json');

    await expect(handler('settings:import')(sender())).resolves.toMatchObject({
      success: false,
      error: expect.any(String)
    });
    expect(state.logger.warn).toHaveBeenCalled();
  });
});
