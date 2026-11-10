import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  stat: vi.fn(),
  getStore: vi.fn(),
  store: { get: vi.fn(), set: vi.fn() },
  data: {} as Record<string, unknown>,
  loggerWarn: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      h.handlers.set(channel, handler);
    }
  }
}));
vi.mock('fs/promises', () => ({ stat: h.stat }));
vi.mock('../cover/cover-cache', () => ({ getStore: h.getStore }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  return import('../playback-handlers');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function call(channel: string, ...args: unknown[]) {
  return h.handlers.get(channel)!({}, ...args);
}

const KEY = 'playbackPositions';

beforeEach(() => {
  vi.useFakeTimers();
  h.handlers.clear();
  h.stat.mockReset();
  h.stat.mockResolvedValue({});
  h.data = {};
  h.store.get.mockReset();
  h.store.get.mockImplementation((key: string) => h.data[key]);
  h.store.set.mockReset();
  h.store.set.mockImplementation((key: string, value: unknown) => {
    h.data[key] = value;
  });
  h.getStore.mockReset();
  h.getStore.mockResolvedValue(h.store);
  h.loggerWarn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getPosition', () => {
  it('reads stored positions and caches them', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.data[KEY] = { 'D:/a.mp3': 42 };

    await expect(call('playback:getPosition', 'D:/a.mp3')).resolves.toBe(42);
    h.store.get.mockClear();
    await expect(call('playback:getPosition', 'D:/a.mp3')).resolves.toBe(42);
    expect(h.store.get).not.toHaveBeenCalled();
  });

  it('returns zero for unknown paths and cleans up missing files', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.data[KEY] = { 'D:/gone.mp3': 0 };
    h.stat.mockResolvedValueOnce(null);

    await expect(call('playback:getPosition', 'D:/gone.mp3')).resolves.toBe(0);
    expect(h.store.set).toHaveBeenCalledWith(KEY, {});
  });

  it('keeps entries whose files still exist', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.data[KEY] = { 'D:/a.mp3': 0 };

    await expect(call('playback:getPosition', 'D:/a.mp3')).resolves.toBe(0);
    expect(h.stat).toHaveBeenCalledWith('D:/a.mp3');
    expect(h.store.set).not.toHaveBeenCalled();
  });

  it('skips existence checks for empty paths', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.data[KEY] = { '': 0 };

    await expect(call('playback:getPosition', '')).resolves.toBe(0);
    expect(h.stat).not.toHaveBeenCalled();
  });

  it('removes entries whose files cannot be inspected', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.data[KEY] = { 'D:/gone.mp3': 0 };
    h.stat.mockRejectedValueOnce(new Error('EACCES'));

    await expect(call('playback:getPosition', 'D:/gone.mp3')).resolves.toBe(0);
    expect(h.store.set).toHaveBeenCalledWith(KEY, {});
  });

  it('logs store failures and returns zero', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.getStore.mockRejectedValueOnce(new Error('store'));

    await expect(call('playback:getPosition', 'D:/a.mp3')).resolves.toBe(0);
    expect(h.loggerWarn).toHaveBeenCalledWith('playback', 'getPosition failed', expect.any(Error));
  });
});

describe('setPosition', () => {
  it('debounces writes and keeps the latest position', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();

    await call('playback:setPosition', 'D:/a.mp3', 10);
    await call('playback:setPosition', 'D:/a.mp3', 20);
    expect(h.store.set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15_000);
    await flush();

    expect(h.store.set).toHaveBeenCalledTimes(1);
    expect(h.data[KEY]).toEqual({ 'D:/a.mp3': 20 });
  });

  it('removes entries for non-positive positions', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.data[KEY] = { 'D:/a.mp3': 99 };

    await call('playback:setPosition', 'D:/a.mp3', 0);
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();

    expect(h.data[KEY]).toEqual({});
  });

  it('caps the stored map at 500 entries', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    const seeded: Record<string, number> = {};
    for (let i = 0; i < 500; i += 1) seeded[`D:/old-${i}.mp3`] = i;
    h.data[KEY] = seeded;

    await call('playback:setPosition', 'D:/new.mp3', 5);
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();

    const stored = h.data[KEY] as Record<string, number>;
    expect(Object.keys(stored)).toHaveLength(500);
    expect(stored).not.toHaveProperty('D:/old-0.mp3');
    expect(stored['D:/new.mp3']).toBe(5);
  });

  it('requeues a failed batch and retries on the next flush', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.getStore.mockRejectedValueOnce(new Error('disk'));

    await call('playback:setPosition', 'D:/a.mp3', 7);
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'playback',
      'persist position failed',
      expect.any(Error)
    );

    await playback.flushPlaybackPositions();
    expect(h.data[KEY]).toEqual({ 'D:/a.mp3': 7 });
  });
});

describe('clearPosition and flushing', () => {
  it('clears the entry immediately', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();
    h.data[KEY] = { 'D:/a.mp3': 30 };

    await call('playback:clearPosition', 'D:/a.mp3');

    expect(h.data[KEY]).toEqual({});
    expect(h.handlers.get('playback:getPosition')).toBeTypeOf('function');
  });

  it('cancels the debounce timer when flushed explicitly', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();

    await call('playback:setPosition', 'D:/a.mp3', 12);
    await playback.flushPlaybackPositions();
    expect(h.store.set).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.store.set).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no pending write', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();

    await expect(playback.flushPlaybackPositions()).resolves.toBeUndefined();
    expect(h.store.set).not.toHaveBeenCalled();
  });

  it('serializes concurrent flushes', async () => {
    const playback = await load();
    playback.registerPlaybackHandlers();

    await call('playback:setPosition', 'D:/a.mp3', 1);
    await call('playback:setPosition', 'D:/b.mp3', 2);

    await Promise.all([playback.flushPlaybackPositions(), playback.flushPlaybackPositions()]);

    expect(h.store.set).toHaveBeenCalledTimes(1);
    expect(h.data[KEY]).toEqual({ 'D:/a.mp3': 1, 'D:/b.mp3': 2 });
  });
});
