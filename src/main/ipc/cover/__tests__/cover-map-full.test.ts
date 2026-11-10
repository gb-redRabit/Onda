import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const h = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  getStore: vi.fn(),
  store: { get: vi.fn(), set: vi.fn() },
  legacy: undefined as unknown,
  safePath: '/userdata' as string,
  loggerWarn: vi.fn()
}));

vi.mock('fs/promises', () => ({
  mkdir: h.mkdir,
  readFile: h.readFile,
  writeFile: h.writeFile
}));
vi.mock('../cover-store', () => ({ getStore: h.getStore }));
vi.mock('../../../utils/profile-state', () => ({ safeUserDataPath: () => h.safePath }));

async function load() {
  vi.resetModules();
  return import('../cover-map');
}

const FILE = join('/userdata', 'cover-cache-map.json');
const TMP_FILE = join(tmpdir(), 'onda', 'cover-cache-map.json');
const KEY = 'coverCacheMap';

function entry(cacheFile = 'a.jpg', mtime = 1) {
  return { cacheFile, mtime };
}

beforeEach(() => {
  vi.useFakeTimers();
  h.mkdir.mockReset();
  h.mkdir.mockResolvedValue(undefined);
  h.readFile.mockReset();
  h.readFile.mockRejectedValue(new Error('ENOENT'));
  h.writeFile.mockReset();
  h.writeFile.mockResolvedValue(undefined);
  h.store.get.mockReset();
  h.store.get.mockReturnValue(undefined);
  h.store.set.mockReset();
  h.legacy = undefined;
  h.safePath = '/userdata';
  h.getStore.mockReset();
  h.getStore.mockResolvedValue(h.store);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('readCoverMap', () => {
  it('reads and caches the map file', async () => {
    const map = { a: entry() };
    h.readFile.mockResolvedValue(JSON.stringify(map));
    const covers = await load();

    await expect(covers.readCoverMap()).resolves.toEqual(map);
    h.readFile.mockClear();
    await expect(covers.readCoverMap()).resolves.toEqual(map);
    expect(h.readFile).not.toHaveBeenCalled();
    expect(h.readFile).toHaveBeenCalledTimes(0);
  });

  it('starts empty for missing or corrupt files', async () => {
    const covers = await load();
    await expect(covers.readCoverMap()).resolves.toEqual({});

    const second = await load();
    h.readFile.mockResolvedValue('not json');
    await expect(second.readCoverMap()).resolves.toEqual({});
  });

  it('migrates legacy electron-store entries once', async () => {
    h.legacy = { legacy: entry('old.jpg', 2) };
    h.store.get.mockReturnValue(h.legacy);
    const covers = await load();

    await expect(covers.readCoverMap()).resolves.toEqual(h.legacy);
    expect(h.writeFile).toHaveBeenCalledWith(FILE, JSON.stringify(h.legacy), 'utf-8');
    expect(h.store.set).toHaveBeenCalledWith(KEY, undefined);
  });

  it('skips the write for empty legacy data', async () => {
    h.store.get.mockReturnValue({});
    const covers = await load();

    await expect(covers.readCoverMap()).resolves.toEqual({});
    expect(h.writeFile).not.toHaveBeenCalled();
    expect(h.store.set).not.toHaveBeenCalled();
  });

  it('ignores migration failures', async () => {
    h.getStore.mockRejectedValueOnce(new Error('store'));
    const covers = await load();

    await expect(covers.readCoverMap()).resolves.toEqual({});
  });
});

describe('writeCoverMap', () => {
  it('creates the directory and writes the data', async () => {
    const covers = await load();
    const data = { a: entry() };

    await covers.writeCoverMap(data);

    expect(h.mkdir).toHaveBeenCalledWith(dirname(FILE), { recursive: true });
    expect(h.writeFile).toHaveBeenCalledWith(FILE, JSON.stringify(data), 'utf-8');
    expect(await covers.readCoverMap()).toEqual(data);
  });

  it('falls back to tmp when userData is unavailable', async () => {
    h.safePath = '';
    const covers = await load();

    await covers.writeCoverMap({ a: entry() });

    expect(h.mkdir).toHaveBeenCalledWith(join(tmpdir(), 'onda'), { recursive: true });
    expect(h.writeFile).toHaveBeenCalledWith(TMP_FILE, expect.any(String), 'utf-8');
  });

  it('cancels a scheduled debounce when writing immediately', async () => {
    const covers = await load();
    covers.scheduleCoverMapWrite({ pending: entry() });

    await covers.writeCoverMap({ immediate: entry() });
    await vi.advanceTimersByTimeAsync(500);

    expect(h.writeFile).toHaveBeenCalledTimes(1);
    expect(h.writeFile).toHaveBeenCalledWith(FILE, JSON.stringify({ immediate: entry() }), 'utf-8');
  });

  it('serializes concurrent writes', async () => {
    let release!: () => void;
    h.writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const covers = await load();

    const first = covers.writeCoverMap({ a: entry() });
    await Promise.resolve();
    const second = covers.writeCoverMap({ b: entry() });
    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    expect(h.writeFile).toHaveBeenCalledTimes(2);
  });

  it('releases the lock after a failed write', async () => {
    h.writeFile.mockRejectedValueOnce(new Error('disk'));
    const covers = await load();

    await expect(covers.writeCoverMap({ a: entry() })).rejects.toThrow('disk');
    await expect(covers.writeCoverMap({ b: entry() })).resolves.toBeUndefined();
    expect(h.writeFile).toHaveBeenCalledTimes(2);
  });
});

describe('debounced writes', () => {
  it('writes only the latest scheduled data after 500 ms', async () => {
    const covers = await load();

    covers.scheduleCoverMapWrite({ first: entry() });
    covers.scheduleCoverMapWrite({ second: entry('b.jpg', 3) });
    expect(h.writeFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(h.writeFile).toHaveBeenCalledTimes(1);
    expect(h.writeFile).toHaveBeenCalledWith(
      FILE,
      JSON.stringify({ second: entry('b.jpg', 3) }),
      'utf-8'
    );
  });

  it('flushes pending data immediately', async () => {
    const covers = await load();
    covers.scheduleCoverMapWrite({ pending: entry() });

    await covers.flushCoverMapWrite();
    expect(h.writeFile).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(h.writeFile).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nothing is pending', async () => {
    const covers = await load();
    await covers.flushCoverMapWrite();
    expect(h.writeFile).not.toHaveBeenCalled();
  });
});
