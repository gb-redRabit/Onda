import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  getStore: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
}));

vi.mock('electron', () => ({ app: { getPath: () => 'C:/user' } }));
vi.mock('fs/promises', () => ({
  readFile: state.readFile,
  mkdir: state.mkdir,
  writeFile: state.writeFile,
  rename: state.rename
}));
vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
  dirname: (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'
}));
vi.mock('../../cover/cover-cache', () => ({ getStore: state.getStore }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.warn, info: state.info, error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  return import('../library-store');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

function files(playCounts: Record<string, number> = {}): any {
  return {
    files: Object.entries(playCounts).map(([path, playCount]) => ({
      path,
      name: path,
      playCount,
      lastPlayed: 5
    })),
    folderTypes: { 'C:/music': 'audio' as const }
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.readFile.mockReset();
  state.mkdir.mockReset();
  state.writeFile.mockReset();
  state.rename.mockReset();
  state.getStore.mockReset();
  state.warn.mockReset();
  state.info.mockReset();
  state.readFile.mockRejectedValue(new Error('ENOENT'));
  state.mkdir.mockResolvedValue(undefined);
  state.writeFile.mockResolvedValue(undefined);
  state.rename.mockResolvedValue(undefined);
  state.getStore.mockResolvedValue({ get: () => null, delete: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loading', () => {
  it('reads the main file and applies the stats sidecar', async () => {
    state.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('library-stats.json')) {
        return JSON.stringify({ a: { playCount: 7, lastPlayed: 9 } });
      }
      return JSON.stringify({
        files: [
          { path: 'a', playCount: 1, lastPlayed: 1 },
          { path: 'b', playCount: 2 }
        ],
        folderTypes: { x: 'video' }
      });
    });
    const store = await load();

    const data = await store.loadLibraryScanned();

    expect(data?.files).toEqual([
      { path: 'a', playCount: 7, lastPlayed: 9 },
      { path: 'b', playCount: 2 }
    ]);
    expect(data?.folderTypes).toEqual({ x: 'video' });
    expect(store.getLibraryScanned()).toBe(data);

    state.readFile.mockClear();
    expect(await store.loadLibraryScanned()).toBe(data);
    expect(state.readFile).not.toHaveBeenCalled();
  });

  it('ignores invalid stats and scanned files', async () => {
    state.readFile.mockResolvedValueOnce('[]').mockResolvedValueOnce('{"files": "nope"}');
    const store = await load();

    expect(await store.loadLibraryScanned()).toEqual({ files: [], folderTypes: {} });
  });

  it('migrates a legacy electron-store value once', async () => {
    const deleteKey = vi.fn();
    state.getStore.mockResolvedValue({
      get: () => ({ files: [{ path: 'legacy', playCount: 0 }], folderTypes: {} }),
      delete: deleteKey
    });
    const store = await load();

    const data = await store.loadLibraryScanned();

    expect(data?.files).toHaveLength(1);
    expect(deleteKey).toHaveBeenCalledWith('libraryScanned');
    expect(state.info).toHaveBeenCalledWith(
      'library',
      expect.stringContaining('migrated libraryScanned')
    );

    await vi.advanceTimersByTimeAsync(0);
    await flush();
    expect(state.writeFile).toHaveBeenCalled();
  });

  it('falls back to empty data when the store is unavailable', async () => {
    state.getStore.mockRejectedValue(new Error('no store'));
    const store = await load();
    expect(await store.loadLibraryScanned()).toEqual({ files: [], folderTypes: {} });
  });

  it('deduplicates concurrent loads', async () => {
    let resolveFile!: (value: string) => void;
    state.readFile
      .mockResolvedValueOnce('{}')
      .mockReturnValueOnce(new Promise((resolve) => (resolveFile = resolve)));
    const store = await load();

    const first = store.loadLibraryScanned();
    const second = store.loadLibraryScanned();
    const calls = state.readFile.mock.calls.length;
    const third = store.loadLibraryScanned();
    expect(state.readFile.mock.calls.length).toBe(calls);

    resolveFile(JSON.stringify({ files: [{ path: 'a' }] }));
    const [a, b, c] = await Promise.all([first, second, third]);
    expect(a).toEqual(b);
    expect(c).toEqual(a);
    expect(a?.files).toHaveLength(1);
  });
});

describe('saving', () => {
  it('persists the scanned library and stats sidecar', async () => {
    const store = await load();
    const data = files({ a: 2, b: 0 });

    store.setLibraryScanned(data);
    await vi.advanceTimersByTimeAsync(400);
    await flush();

    expect(state.writeFile).toHaveBeenCalledWith(
      'C:/user/library-scanned.json.tmp',
      expect.any(String),
      'utf-8'
    );
    expect(state.rename).toHaveBeenCalledWith(
      'C:/user/library-scanned.json.tmp',
      'C:/user/library-scanned.json'
    );
    expect(state.writeFile).toHaveBeenCalledWith(
      'C:/user/library-stats.json.tmp',
      JSON.stringify({ a: { playCount: 2, lastPlayed: 5 } }),
      'utf-8'
    );
  });

  it('debounces library saves', async () => {
    const store = await load();
    store.setLibraryScanned(files());
    state.writeFile.mockClear();

    store.scheduleLibraryScannedSave(400);
    store.scheduleLibraryScannedSave(400);
    await vi.advanceTimersByTimeAsync(399);
    await flush();
    expect(
      state.writeFile.mock.calls.filter((call) => String(call[0]).includes('library-scanned'))
    ).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(
      state.writeFile.mock.calls.filter((call) => String(call[0]).includes('library-scanned'))
    ).toHaveLength(1);
  });

  it('warns on write failures', async () => {
    state.writeFile.mockRejectedValue(new Error('disk full'));
    const store = await load();
    store.setLibraryScanned(files({ a: 1 }));
    await vi.advanceTimersByTimeAsync(400);
    await flush();
    expect(state.warn).toHaveBeenCalledWith(
      'library',
      'failed to persist library-scanned.json',
      expect.any(Error)
    );

    state.warn.mockClear();
    await store.flushStats();
    expect(state.warn).toHaveBeenCalledWith(
      'library',
      'failed to persist library-stats.json',
      expect.any(Error)
    );
  });

  it('does not write without cached data', async () => {
    const store = await load();
    await store.flushLibraryScanned();
    expect(state.writeFile).not.toHaveBeenCalled();
  });

  it('coalesces writes requested while flushing', async () => {
    const store = await load();
    let resolveWrite!: () => void;
    let calls = 0;
    state.writeFile.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return new Promise<void>((resolve) => (resolveWrite = resolve));
      return Promise.resolve();
    });
    store.setLibraryScanned(files({ a: 1 }));

    const first = store.flushStats();
    await flush();
    const second = store.flushStats();
    resolveWrite();
    await first;
    await second;
    expect(state.writeFile).toHaveBeenCalledTimes(2);
  });
});

describe('stats updates', () => {
  it('updates matching files and ignores missing data', async () => {
    const store = await load();
    expect(store.updateLibraryStats([{ path: 'a', playCount: 1, lastPlayed: 2 }])).toBe(false);

    store.setLibraryScanned(files({ a: 1 }));
    expect(store.updateLibraryStats([])).toBe(false);
    expect(store.updateLibraryStats([{ path: 'missing', playCount: 5, lastPlayed: 5 }])).toBe(
      false
    );

    expect(store.updateLibraryStats([{ path: 'a', playCount: 4, lastPlayed: 7 }])).toBe(true);
    const file = store.getLibraryScanned().files.find((f) => f.path === 'a')!;
    expect(file.playCount).toBe(4);
    expect(file.lastPlayed).toBe(7);
  });

  it('applies loudness updates without overriding tags', async () => {
    const store = await load();
    expect(store.applyLoudnessUpdates([{ path: 'a', trackGain: 1 }])).toBe(0);

    const data = files({ a: 1, b: 1 });
    data.files[0].metadata = { replayGainTrackGain: -3 };
    store.setLibraryScanned(data);
    expect(store.applyLoudnessUpdates([])).toBe(0);

    const changed = store.applyLoudnessUpdates([
      { path: 'a', trackGain: 1, albumGain: 2 },
      { path: 'b', trackGain: 3 },
      { path: 'missing', trackGain: 4 }
    ]);

    expect(changed).toBe(2);
    const a = store.getLibraryScanned().files[0];
    const b = store.getLibraryScanned().files[1];
    expect(a.metadata?.replayGainTrackGain).toBe(-3);
    expect(a.metadata?.replayGainAlbumGain).toBe(2);
    expect(a.metadata?.replayGainScanned).toBe(true);
    expect(b.metadata?.replayGainTrackGain).toBe(3);
  });

  it('initializes metadata when missing', async () => {
    const store = await load();
    store.setLibraryScanned(files({ a: 0 }));
    expect(store.applyLoudnessUpdates([{ path: 'a', trackGain: 2 }])).toBe(1);
    expect(store.getLibraryScanned().files[0].metadata).toEqual({
      replayGainTrackGain: 2,
      replayGainScanned: true
    });
  });
});
