import { beforeEach, describe, expect, it, vi } from 'vitest';

// Encrypted electron-store bootstrap: per-install key, corruption recovery,
// file/store migrations and retry after a failed initialization.

const h = vi.hoisted(() => ({
  userData: '/userData',
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  randomBytes: vi.fn(),
  ensureStoreBackup: vi.fn(),
  pendingStoreMigrations: vi.fn(),
  runFileMigrations: vi.fn(),
  runStoreMigrations: vi.fn(),
  createStore: vi.fn(),
  constructorCalls: 0,
  failConstructorTimes: 0,
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('electron', () => ({ app: { getPath: () => h.userData } }));
vi.mock('fs/promises', () => ({
  readFile: h.readFile,
  writeFile: h.writeFile,
  mkdir: h.mkdir,
  rename: h.rename
}));
vi.mock('crypto', () => ({ randomBytes: h.randomBytes }));
vi.mock('../../state-migrations', () => ({
  ensureStoreBackup: h.ensureStoreBackup,
  pendingStoreMigrations: h.pendingStoreMigrations,
  runFileMigrations: h.runFileMigrations,
  runStoreMigrations: h.runStoreMigrations
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, error: h.error, info: vi.fn(), debug: vi.fn() }
}));
vi.mock('electron-store', () => ({
  default: class FakeStore {
    constructor(options: unknown) {
      h.createStore(options);
      h.constructorCalls++;
      if (h.constructorCalls <= h.failConstructorTimes) throw new Error('corrupt config');
    }
  }
}));

const KEY = 'ab'.repeat(32);

async function loadModule() {
  vi.resetModules();
  return import('../cover/cover-store');
}

beforeEach(() => {
  h.readFile.mockReset().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  h.writeFile.mockReset().mockResolvedValue(undefined);
  h.mkdir.mockReset().mockResolvedValue(undefined);
  h.rename.mockReset().mockResolvedValue(undefined);
  h.randomBytes.mockReset().mockReturnValue(Buffer.alloc(32, 0xab));
  h.ensureStoreBackup.mockReset().mockResolvedValue(true);
  h.pendingStoreMigrations.mockReset().mockReturnValue([]);
  h.runFileMigrations.mockReset().mockResolvedValue(null);
  h.runStoreMigrations.mockReset().mockResolvedValue(undefined);
  h.createStore.mockReset();
  h.warn.mockClear();
  h.error.mockClear();
  h.constructorCalls = 0;
  h.failConstructorTimes = 0;
});

describe('getStore encryption key', () => {
  it('creates and persists a random per-install key on first run', async () => {
    const { getStore } = await loadModule();

    const store = await getStore();

    expect(store).toBeDefined();
    expect(h.mkdir).toHaveBeenCalledWith(h.userData, { recursive: true });
    expect(h.writeFile).toHaveBeenCalledWith(expect.stringMatching(/onda-store-key$/), KEY, {
      mode: 0o600
    });
    expect(h.createStore).toHaveBeenCalledWith({ encryptionKey: KEY });
  });

  it('reuses a valid existing key', async () => {
    h.readFile.mockResolvedValue(`  ${KEY}  \n`);
    const { getStore } = await loadModule();

    await getStore();

    expect(h.writeFile).not.toHaveBeenCalled();
    expect(h.randomBytes).not.toHaveBeenCalled();
    expect(h.createStore).toHaveBeenCalledWith({ encryptionKey: KEY });
  });

  it('regenerates an invalid key file', async () => {
    h.readFile.mockResolvedValue('too-short');
    const { getStore } = await loadModule();

    await getStore();

    expect(h.writeFile).toHaveBeenCalledWith(expect.any(String), KEY, { mode: 0o600 });
  });

  it('uses a key produced by the file migration', async () => {
    h.runFileMigrations.mockResolvedValue('migrated-key');
    const { getStore } = await loadModule();

    await getStore();

    expect(h.createStore).toHaveBeenCalledWith({ encryptionKey: 'migrated-key' });
    expect(h.writeFile).not.toHaveBeenCalled();
  });
});

describe('getStore recovery', () => {
  it('moves a corrupt config aside and retries once', async () => {
    h.failConstructorTimes = 1;
    const { getStore } = await loadModule();

    await getStore();

    expect(h.createStore).toHaveBeenCalledTimes(2);
    expect(h.rename).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      expect.stringMatching(/config\.json\.corrupt-\d+$/)
    );
    expect(h.error).toHaveBeenCalledWith(
      'state',
      'store load failed — moving config.json aside',
      expect.any(Error)
    );
  });

  it('runs pending store migrations after a successful backup', async () => {
    h.pendingStoreMigrations.mockReturnValue(['migration']);
    const { getStore } = await loadModule();

    await getStore();

    expect(h.ensureStoreBackup).toHaveBeenCalledWith(expect.stringContaining('config.json'));
    expect(h.runStoreMigrations).toHaveBeenCalledTimes(1);
  });

  it('skips migrations when the backup fails', async () => {
    h.pendingStoreMigrations.mockReturnValue(['migration']);
    h.ensureStoreBackup.mockResolvedValue(false);
    const { getStore } = await loadModule();

    await getStore();

    expect(h.runStoreMigrations).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith(
      'state',
      'store backup failed — skipping migrations (retried next boot)'
    );
  });

  it('retries initialization after a rejected Promise instead of caching it', async () => {
    h.mkdir.mockRejectedValueOnce(new Error('locked'));
    const { getStore } = await loadModule();

    await expect(getStore()).rejects.toThrow('locked');
    expect(h.error).toHaveBeenCalledWith('state', 'store initialization failed', expect.any(Error));

    await expect(getStore()).resolves.toBeDefined();
    expect(h.createStore).toHaveBeenCalled();
  });

  it('reuses the cached store promise between calls', async () => {
    const { getStore } = await loadModule();

    const first = getStore();
    const second = getStore();

    await expect(first).resolves.toBe(await second);
    expect(h.createStore).toHaveBeenCalledTimes(1);
  });
});
