import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handle: vi.fn(),
  getStore: vi.fn(),
  clearAppCaches: vi.fn(),
  clearLogFile: vi.fn(),
  removeProfileState: vi.fn(),
  relaunchApp: vi.fn(),
  defaultSession: null as unknown,
  fromPartition: vi.fn(),
  providerPartitions: ['persist:provider'] as string[],
  logger: { info: vi.fn(), warn: vi.fn() },
  isPackaged: true,
  userData: 'C:/user'
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => h.userData,
    get isPackaged() {
      return h.isPackaged;
    }
  },
  ipcMain: { handle: h.handle },
  session: {
    get defaultSession() {
      return h.defaultSession;
    },
    fromPartition: h.fromPartition
  }
}));
vi.mock('../../../shared/logger', () => ({ logger: h.logger }));
vi.mock('../cover/cover-store', () => ({ getStore: h.getStore }));
vi.mock('../app-cache', () => ({ clearAppCaches: h.clearAppCaches }));
vi.mock('../../log-file', () => ({ clearLogFile: h.clearLogFile }));
vi.mock('../../youtube/youtube-auth-session', () => ({ AUTH_PARTITION: 'persist:auth' }));
vi.mock('../providers/provider-login', () => ({
  providerLoginPartitions: () => h.providerPartitions
}));
vi.mock('../../preview/preview-session', () => ({ PREVIEW_PARTITION: 'persist:preview' }));
vi.mock('../../utils/profile-state', () => ({ removeProfileState: h.removeProfileState }));
vi.mock('../../state-migrations', () => ({
  CURRENT_STORE_VERSION: 7,
  MAX_STORE_BACKUPS: 3,
  STORE_VERSION_KEY: 'storeVersion'
}));
vi.mock('../../bootstrap/relaunch', () => ({ relaunchApp: h.relaunchApp }));

async function load() {
  vi.resetModules();
  return import('../factory-reset');
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    clearStorageData: vi.fn(async () => undefined),
    clearCache: vi.fn(async () => undefined),
    ...overrides
  };
}

function store() {
  return { clear: vi.fn(), set: vi.fn() };
}

beforeEach(() => {
  h.handle.mockReset();
  h.getStore.mockReset();
  h.getStore.mockResolvedValue(store());
  h.clearAppCaches.mockReset();
  h.clearAppCaches.mockResolvedValue(undefined);
  h.clearLogFile.mockReset();
  h.clearLogFile.mockResolvedValue(undefined);
  h.removeProfileState.mockReset();
  h.removeProfileState.mockResolvedValue([]);
  h.relaunchApp.mockReset();
  h.defaultSession = session();
  h.fromPartition.mockReset();
  h.fromPartition.mockImplementation(() => session());
  h.providerPartitions = ['persist:provider'];
  h.logger.info.mockReset();
  h.logger.warn.mockReset();
  h.isPackaged = true;
  delete (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'];
});

afterEach(() => {
  delete (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'];
});

describe('factoryReset', () => {
  it('clears state, caches, logs and sessions, then relaunches', async () => {
    const reset = await load();
    const fakeStore = store();
    h.getStore.mockResolvedValue(fakeStore);
    h.removeProfileState.mockResolvedValue(['locked.txt']);

    await expect(reset.factoryReset()).resolves.toEqual({ success: true });

    expect(fakeStore.clear).toHaveBeenCalled();
    expect(fakeStore.set).toHaveBeenCalledWith('storeVersion', 7);
    expect(h.clearAppCaches).toHaveBeenCalled();
    expect(h.removeProfileState).toHaveBeenCalledWith('C:/user', [
      'config.json.bak.1',
      'config.json.bak.2',
      'config.json.bak.3'
    ]);
    expect(h.clearLogFile).toHaveBeenCalled();
    expect(h.fromPartition.mock.calls.map(([partition]) => partition)).toEqual([
      'persist:auth',
      'persist:provider',
      'persist:preview'
    ]);
    expect(h.relaunchApp).toHaveBeenCalledWith(800);
    expect(h.logger.info).toHaveBeenCalledWith(
      'reset',
      'factory reset complete (1 locked entries kept)'
    );
    expect(reset.isResetting()).toBe(true);
  });

  it('reports failures and allows a retry', async () => {
    const reset = await load();
    h.getStore.mockRejectedValueOnce(new Error('store locked'));

    await expect(reset.factoryReset()).resolves.toEqual({
      success: false,
      error: 'store locked'
    });
    expect(reset.isResetting()).toBe(false);
    expect(h.relaunchApp).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalledWith('reset', 'factory reset failed', expect.any(Error));
  });

  it('refuses a second reset while one is running', async () => {
    const reset = await load();

    await reset.factoryReset();
    const second = await reset.factoryReset();

    expect(second).toEqual({ success: false, error: 'reset already in progress' });
    expect(h.relaunchApp).toHaveBeenCalledTimes(1);
  });

  it('keeps going when a session cannot be cleared', async () => {
    const reset = await load();
    h.fromPartition.mockImplementation((partition: string) =>
      partition === 'persist:provider'
        ? session({ clearStorageData: vi.fn(async () => Promise.reject(new Error('busy'))) })
        : session()
    );

    await expect(reset.factoryReset()).resolves.toEqual({ success: true });
    expect(h.logger.warn).toHaveBeenCalledWith(
      'reset',
      'factory reset could not clear the persist:provider session',
      expect.any(Error)
    );
  });

  it('logs the dev restart mode', async () => {
    const reset = await load();
    h.isPackaged = false;
    (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'] =
      'http://localhost:5173';

    await reset.factoryReset();

    expect(h.logger.info).toHaveBeenCalledWith('reset', 'dev build — restarting the dev command');
  });

  it('logs a dev exit without a dev server', async () => {
    const reset = await load();
    h.isPackaged = false;

    await reset.factoryReset();

    expect(h.logger.info).toHaveBeenCalledWith(
      'reset',
      'dev build without a dev server — exiting (start the app again)'
    );
  });

  it('registers the IPC handler', async () => {
    const reset = await load();
    reset.registerFactoryResetHandler();

    expect(h.handle).toHaveBeenCalledWith('app:factoryReset', expect.any(Function));
    const handler = h.handle.mock.calls[0][1] as () => Promise<unknown>;
    await expect(handler()).resolves.toEqual({ success: true });
  });

  it('coerces non-error failures to text', async () => {
    const reset = await load();
    h.getStore.mockRejectedValueOnce('plain failure');

    await expect(reset.factoryReset()).resolves.toEqual({
      success: false,
      error: 'plain failure'
    });
  });
});
