import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  watch: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  lastWatcher: null as any,
  handlers: new Map<string, (...args: any[]) => any>()
}));

vi.mock('chokidar', () => ({ watch: state.watch }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: state.loggerInfo, error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  return import('../library-watcher');
}

beforeEach(() => {
  vi.useFakeTimers();
  state.handlers.clear();
  state.lastWatcher = null;
  state.watch.mockReset();
  state.watch.mockImplementation(() => {
    const watcher: any = {
      on: vi.fn((event: string, handler: (...args: any[]) => any) => {
        state.handlers.set(event, handler);
        return watcher;
      }),
      close: vi.fn(async () => undefined)
    };
    state.lastWatcher = watcher;
    return watcher;
  });
  state.loggerWarn.mockReset();
  state.loggerInfo.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('starting', () => {
  it('stops instead of watching an empty list', async () => {
    const watcher = await load();
    watcher.setLibraryWatcherScan(vi.fn());
    await watcher.startLibraryWatcher(['', undefined as unknown as string]);

    expect(state.watch).not.toHaveBeenCalled();
  });

  it('creates a watcher with media-only filtering', async () => {
    const api = await load();
    await api.startLibraryWatcher(['C:/music', 'C:/video']);

    expect(state.watch).toHaveBeenCalledWith(
      ['C:/music', 'C:/video'],
      expect.objectContaining({
        ignoreInitial: true,
        depth: 8,
        awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 }
      })
    );
    const options = state.watch.mock.calls[0][1];
    expect(options.ignored('C:/music/a.MP3', undefined)).toBe(false);
    expect(options.ignored('C:/music/cover.JPG', { isDirectory: () => false })).toBe(false);
    expect(options.ignored('C:/music/sub', { isDirectory: () => true })).toBe(false);
    expect(options.ignored('C:/music/notes.txt', { isDirectory: () => false })).toBe(true);
    expect(options.ignored('C:/music/unknown', undefined)).toBe(true);

    expect(state.handlers.has('add')).toBe(true);
    expect(state.handlers.has('change')).toBe(true);
    expect(state.handlers.has('unlink')).toBe(true);
    expect(state.handlers.has('error')).toBe(true);
    expect(state.loggerInfo).toHaveBeenCalledWith('library-watcher', 'watching 2 folder(s)');
  });

  it('keeps an equivalent folder set without restarting', async () => {
    const api = await load();
    await api.startLibraryWatcher(['C:/b', 'C:/a']);
    await api.startLibraryWatcher(['C:/a', 'C:/b']);

    expect(state.watch).toHaveBeenCalledTimes(1);
    expect(state.lastWatcher.close).not.toHaveBeenCalled();
  });

  it('restarts when the folder set changes', async () => {
    const api = await load();
    await api.startLibraryWatcher(['C:/a']);
    const first = state.lastWatcher;

    await api.startLibraryWatcher(['C:/b']);

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(state.watch).toHaveBeenCalledTimes(2);
  });

  it('serialises concurrent starts', async () => {
    const api = await load();

    await Promise.all([api.startLibraryWatcher(['C:/a']), api.startLibraryWatcher(['C:/b'])]);

    expect(state.watch).toHaveBeenCalledTimes(2);
  });

  it('logs import failures', async () => {
    vi.doMock('chokidar', () => {
      throw new Error('missing');
    });
    const api = await load();

    await expect(api.startLibraryWatcher(['C:/a'])).resolves.toBeUndefined();

    const call = state.loggerWarn.mock.calls.find(
      ([, message]) => message === 'failed to start watcher'
    );
    expect(call).toBeTruthy();
    vi.doMock('chokidar', () => ({ watch: state.watch }));
  });
});

describe('events', () => {
  it('debounces rescans', async () => {
    const api = await load();
    const scan = vi.fn(async () => undefined);
    api.setLibraryWatcherScan(scan);
    await api.startLibraryWatcher(['C:/a']);

    state.handlers.get('add')!();
    vi.advanceTimersByTime(1999);
    expect(scan).not.toHaveBeenCalled();

    state.handlers.get('change')!();
    vi.advanceTimersByTime(1999);
    expect(scan).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('reschedules for every event kind', async () => {
    const api = await load();
    const scan = vi.fn(async () => undefined);
    api.setLibraryWatcherScan(scan);
    await api.startLibraryWatcher(['C:/a']);

    state.handlers.get('unlink')!();
    state.handlers.get('add')!();
    state.handlers.get('change')!();
    vi.advanceTimersByTime(2000);

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('logs watcher errors', async () => {
    const api = await load();
    await api.startLibraryWatcher(['C:/a']);
    const error = new Error('EACCES');

    state.handlers.get('error')!(error);

    expect(state.loggerWarn).toHaveBeenCalledWith('library-watcher', 'watcher error', error);
  });

  it('tolerates a missing scan callback', async () => {
    const api = await load();
    await api.startLibraryWatcher(['C:/a']);

    state.handlers.get('add')!();
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});

describe('stopping', () => {
  it('closes the watcher and clears pending scans', async () => {
    const api = await load();
    const scan = vi.fn(async () => undefined);
    api.setLibraryWatcherScan(scan);
    await api.startLibraryWatcher(['C:/a']);
    state.handlers.get('add')!();

    api.stopLibraryWatcher();
    vi.advanceTimersByTime(5000);

    expect(state.lastWatcher.close).toHaveBeenCalledTimes(1);
    expect(scan).not.toHaveBeenCalled();
  });

  it('can restart after stopping', async () => {
    const api = await load();
    await api.startLibraryWatcher(['C:/a']);
    api.stopLibraryWatcher();

    await api.startLibraryWatcher(['C:/a']);

    expect(state.watch).toHaveBeenCalledTimes(2);
  });

  it('is safe without a watcher', async () => {
    const api = await load();
    expect(() => api.stopLibraryWatcher()).not.toThrow();
  });
});
