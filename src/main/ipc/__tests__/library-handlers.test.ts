import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Handlery biblioteki: store, skan, watcher i polityka ścieżek są podstawione.
const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  store: { get: vi.fn(), set: vi.fn() } as any,
  stat: vi.fn(),
  scanFilePaths: vi.fn(),
  runLibraryScan: vi.fn(),
  analyze: vi.fn(),
  loadScanned: vi.fn(),
  setScanned: vi.fn(),
  flushScanned: vi.fn(),
  applyLoudness: vi.fn(),
  updateStats: vi.fn(),
  mergeAdded: vi.fn(),
  sanitizeScanned: vi.fn(),
  sanitizeFiles: vi.fn(),
  sanitizeFolders: vi.fn(),
  withoutSensitive: vi.fn(),
  isSystemTemp: vi.fn((_path?: string) => false),
  isProtected: vi.fn((_path?: string) => false),
  isSensitive: vi.fn((_path?: string) => false),
  addAllowedRoot: vi.fn(async () => true),
  setAllowedRoots: vi.fn(async () => undefined),
  broadcast: vi.fn(),
  e2e: vi.fn(() => false),
  startWatcher: vi.fn(),
  watcherScan: null as null | (() => Promise<void>),
  registerPlaylists: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    }
  }
}));
vi.mock('fs/promises', () => ({ stat: state.stat }));
vi.mock('../cover/cover-cache', () => ({ getStore: async () => state.store }));
vi.mock('../../../shared/logger', () => ({ logger: state.logger }));
vi.mock('../../media/media-server', () => ({
  addAllowedRoot: state.addAllowedRoot,
  setAllowedRoots: state.setAllowedRoots
}));
vi.mock('../../path-policy', () => ({
  isProtectedPath: state.isProtected,
  isSensitivePath: state.isSensitive
}));
vi.mock('../library/library-scan', () => ({ scanFilePaths: state.scanFilePaths }));
vi.mock('../../utils/broadcast', () => ({ broadcastToAllWindows: state.broadcast }));
vi.mock('../../e2e-fixtures', () => ({ e2eFixturesEnabled: state.e2e }));
vi.mock('../library/library-watcher', () => ({
  startLibraryWatcher: state.startWatcher,
  setLibraryWatcherScan: (callback: () => Promise<void>) => {
    state.watcherScan = callback;
  }
}));
vi.mock('../library/library-store', () => ({
  applyLoudnessUpdates: state.applyLoudness,
  flushLibraryScanned: state.flushScanned,
  loadLibraryScanned: state.loadScanned,
  setLibraryScanned: state.setScanned,
  updateLibraryStats: state.updateStats
}));
vi.mock('../library/loudness-analysis', () => ({ analyzeLibraryLoudness: state.analyze }));
vi.mock('../library/library-add', () => ({ mergeAddedFiles: state.mergeAdded }));
vi.mock('../library/library-handlers-paths', () => ({
  isSystemTemp: state.isSystemTemp,
  sanitizeFilePaths: state.sanitizeFiles,
  sanitizeFolderPaths: state.sanitizeFolders,
  withoutSensitivePaths: state.withoutSensitive
}));
vi.mock('../library/library-handlers-scan', () => ({ runLibraryScan: state.runLibraryScan }));
vi.mock('../library/library-scanned-payload', () => ({
  sanitizeScannedPayload: state.sanitizeScanned
}));
vi.mock('../library/library-handlers-playlists', () => ({
  registerPlaylistHandlers: state.registerPlaylists
}));

const { registerLibraryHandlers, addLibraryFolder, cancelLibraryLoudness } =
  await import('../library/library-handlers');
registerLibraryHandlers();
const watcherScanCallback = state.watcherScan!;

function handler(channel: string): (...args: any[]) => any {
  const found = state.handlers.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function sender(destroyed = false) {
  return { isDestroyed: () => destroyed, send: vi.fn() };
}

beforeEach(() => {
  state.store.get.mockReset();
  state.store.get.mockReturnValue(undefined);
  state.store.set.mockClear();
  state.stat.mockReset();
  state.stat.mockResolvedValue({ isFile: () => true });
  state.scanFilePaths.mockReset();
  state.scanFilePaths.mockResolvedValue([]);
  state.runLibraryScan.mockReset();
  state.runLibraryScan.mockResolvedValue({
    count: 0,
    folderTypes: {},
    aborted: false,
    truncated: false
  });
  state.analyze.mockReset();
  state.analyze.mockResolvedValue({
    updates: [],
    summary: { analyzed: 0, albums: 0, failed: 0, aborted: false, truncated: false }
  });
  state.loadScanned.mockReset();
  state.loadScanned.mockResolvedValue(null);
  state.setScanned.mockClear();
  state.flushScanned.mockClear();
  state.applyLoudness.mockReset();
  state.applyLoudness.mockReturnValue(0);
  state.updateStats.mockClear();
  state.mergeAdded.mockReset();
  state.sanitizeScanned.mockReset();
  state.sanitizeFiles.mockReset();
  state.sanitizeFiles.mockImplementation((input: unknown) =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : []
  );
  state.sanitizeFolders.mockReset();
  state.sanitizeFolders.mockImplementation((input: unknown) =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : []
  );
  state.withoutSensitive.mockReset();
  state.withoutSensitive.mockImplementation((paths: string[]) => paths);
  state.isSystemTemp.mockReset();
  state.isSystemTemp.mockReturnValue(false);
  state.isProtected.mockReset();
  state.isProtected.mockReturnValue(false);
  state.isSensitive.mockReset();
  state.isSensitive.mockReturnValue(false);
  state.addAllowedRoot.mockClear();
  state.setAllowedRoots.mockClear();
  state.broadcast.mockClear();
  state.e2e.mockReset();
  state.e2e.mockReturnValue(false);
  state.startWatcher.mockClear();
  state.logger.warn.mockClear();
  state.logger.error.mockClear();
  state.logger.info.mockClear();
  delete process.env.ONDA_E2E_LIBRARY_FAIL;
});

afterEach(() => {
  delete process.env.ONDA_E2E_LIBRARY_FAIL;
});

describe('registration and folders', () => {
  it('registers handlers', () => {
    expect([...state.handlers.keys()]).toEqual(
      expect.arrayContaining([
        'library:scanCancel',
        'library:loudnessCancel',
        'library:analyzeLoudness',
        'library:addFiles',
        'library:scan',
        'library:loadFolders',
        'library:saveFolders',
        'library:loadScannedChunk',
        'library:saveScanned',
        'library:updateStats'
      ])
    );
  });

  it('loads and saves folders, updating roots and watcher', async () => {
    state.store.get.mockReturnValue(['/lib', '/lib2']);

    await expect(handler('library:loadFolders')({})).resolves.toEqual(['/lib', '/lib2']);
    expect(state.setAllowedRoots).toHaveBeenCalledWith(['/lib', '/lib2']);
    expect(state.startWatcher).toHaveBeenCalledWith(['/lib', '/lib2']);

    state.store.get.mockReturnValue(undefined);
    await expect(handler('library:saveFolders')({}, ['/new'])).resolves.toEqual(['/new']);
    expect(state.store.set).toHaveBeenCalledWith('libraryFolders', ['/new']);
  });

  it('reports empty folders and rethrows save errors', async () => {
    state.store.get.mockImplementation((key: string) => {
      if (key === 'libraryFolders') throw new Error('bad store');
      return undefined;
    });
    await expect(handler('library:loadFolders')({})).resolves.toEqual([]);
    expect(state.logger.error).toHaveBeenCalled();

    state.store.get.mockImplementation(() => undefined);
    state.setAllowedRoots.mockRejectedValueOnce(new Error('roots'));
    await expect(handler('library:saveFolders')({}, ['/x'])).rejects.toThrow('roots');
  });

  it('adds a library folder idempotently', async () => {
    state.store.get.mockReturnValue(['/lib']);

    await expect(addLibraryFolder('/new')).resolves.toEqual(['/lib', '/new']);
    expect(state.store.set).toHaveBeenCalledWith('libraryFolders', ['/lib', '/new']);
    expect(state.setAllowedRoots).toHaveBeenCalledWith(['/lib', '/new']);
    expect(state.startWatcher).toHaveBeenCalledWith(['/lib', '/new']);

    state.store.get.mockReturnValue(['/lib', '/new']);
    state.store.set.mockClear();
    await addLibraryFolder('/new');
    expect(state.store.set).toHaveBeenCalledWith('libraryFolders', ['/lib', '/new']);
  });
});

describe('scan', () => {
  it('sanitizes folders, reports progress and releases the controller', async () => {
    state.store.get.mockReturnValue({ fastScan: true });
    state.runLibraryScan.mockResolvedValue({
      count: 2,
      folderTypes: {},
      aborted: false,
      truncated: false
    });
    const event = { sender: sender() };
    const result = await handler('library:scan')(event, ['/lib', 42]);

    expect(result).toMatchObject({ count: 2 });
    expect(state.runLibraryScan).toHaveBeenCalledWith(
      ['/lib'],
      expect.any(AbortSignal),
      expect.any(Function),
      false,
      true
    );
    const progress = state.runLibraryScan.mock.calls[0][2] as (
      current: number,
      total: number
    ) => void;
    progress(1, 2);
    expect(event.sender.send).toHaveBeenCalledWith('library:scan:progress', {
      current: 1,
      total: 2
    });
  });

  it('aborts the previous scan and falls back on errors', async () => {
    const first = deferred<unknown>();
    state.runLibraryScan.mockReturnValueOnce(first.promise);
    const firstRun = handler('library:scan')({ sender: sender() }, ['/a']);

    state.runLibraryScan.mockRejectedValueOnce(new Error('scan failed'));
    await expect(handler('library:scan')({ sender: sender() }, ['/b'])).resolves.toEqual({
      count: 0,
      folderTypes: {},
      aborted: false,
      truncated: false
    });
    const firstSignal = state.runLibraryScan.mock.calls[0][1] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(state.logger.error).toHaveBeenCalled();

    first.resolve({ count: 1, folderTypes: {}, aborted: true, truncated: false });
    await firstRun;
  });

  it('cancels the active scan', async () => {
    const pendingScan = deferred<unknown>();
    state.runLibraryScan.mockReturnValueOnce(pendingScan.promise);
    const run = handler('library:scan')({ sender: sender() }, ['/lib']);
    await vi.waitFor(() => expect(state.runLibraryScan).toHaveBeenCalled());

    expect(handler('library:scanCancel')({})).toBe(true);
    const signal = state.runLibraryScan.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(true);

    pendingScan.resolve({ count: 0, folderTypes: {}, aborted: true, truncated: false });
    await run;
  });

  it('defers a watcher rescan until the active scan finishes', async () => {
    const scan = deferred<{
      count: number;
      folderTypes: Record<string, never>;
      aborted: boolean;
      truncated: boolean;
    }>();
    state.runLibraryScan.mockReturnValueOnce(scan.promise);
    const run = handler('library:scan')({ sender: sender() }, ['/lib']);

    await expect(watcherScanCallback()).resolves.toBeUndefined();
    expect(state.runLibraryScan).toHaveBeenCalledTimes(1);

    scan.resolve({ count: 0, folderTypes: {}, aborted: false, truncated: false });
    await run;
    await vi.waitFor(() => expect(state.runLibraryScan).toHaveBeenCalledTimes(2));
    expect(state.runLibraryScan.mock.calls[1].slice(1)).toEqual([
      expect.any(AbortSignal),
      undefined,
      true,
      false
    ]);
  });

  it('runs a watcher scan immediately when idle', async () => {
    state.store.get.mockReturnValue(['/lib']);
    await handler('library:loadFolders')({});
    await watcherScanCallback();
    expect(state.runLibraryScan).toHaveBeenCalledWith(
      ['/lib'],
      expect.any(AbortSignal),
      undefined,
      true,
      false
    );
  });
});

describe('addFiles', () => {
  it('filters non-files, protected and sensitive paths before scanning', async () => {
    state.loadScanned.mockResolvedValue({ files: [], folderTypes: {} });
    state.stat.mockImplementation(async (path: string) => ({ isFile: () => path !== '/dir' }));
    state.isProtected.mockImplementation((path?: string) => path === '/protected');
    state.isSensitive.mockImplementation((path?: string) => path === '/secret');
    state.scanFilePaths.mockResolvedValue([{ path: '/ok' }]);
    state.mergeAdded.mockReturnValue({
      added: 1,
      files: [{ path: '/ok' }],
      folderTypes: {},
      dirs: ['/ok-dir']
    });

    const result = await handler('library:addFiles')({}, ['/ok', '/dir', '/protected', '/secret']);

    expect(result).toEqual({ added: 1, skipped: 3, total: 4 });
    expect(state.isSensitive).toHaveBeenCalledWith('/secret');
    expect(state.scanFilePaths).toHaveBeenCalledWith(['/ok'], expect.any(Map), false);
    expect(state.addAllowedRoot).toHaveBeenCalledWith('/ok-dir');
    expect(state.setScanned).toHaveBeenCalledWith({ files: [{ path: '/ok' }], folderTypes: {} });
    expect(state.flushScanned).toHaveBeenCalled();
    expect(state.broadcast).toHaveBeenCalledWith('library:updated');
  });

  it('returns early for invalid input and no usable files', async () => {
    await expect(handler('library:addFiles')({}, 'nope')).resolves.toEqual({
      added: 0,
      skipped: 0,
      total: 0
    });
    await expect(handler('library:addFiles')({}, [1, 2])).resolves.toEqual({
      added: 0,
      skipped: 2,
      total: 2
    });
  });

  it('stops when scanning or merging adds nothing', async () => {
    state.loadScanned.mockResolvedValue({ files: [], folderTypes: {} });
    state.scanFilePaths.mockResolvedValue([]);
    await expect(handler('library:addFiles')({}, ['/a'])).resolves.toEqual({
      added: 0,
      skipped: 1,
      total: 1
    });

    state.scanFilePaths.mockResolvedValue([{ path: '/a' }]);
    state.mergeAdded.mockReturnValue({ added: 0, files: [], folderTypes: {}, dirs: [] });
    await expect(handler('library:addFiles')({}, ['/a'])).resolves.toEqual({
      added: 0,
      skipped: 1,
      total: 1
    });
  });

  it('reports unexpected errors', async () => {
    state.loadScanned.mockRejectedValue(new Error('store down'));
    await expect(handler('library:addFiles')({}, ['/a'])).resolves.toEqual({
      added: 0,
      skipped: 1,
      total: 1,
      error: 'store down'
    });
    expect(state.logger.error).toHaveBeenCalled();
  });

  it('uses the fast-scan setting when the store is available', async () => {
    state.store.get.mockReturnValue({ fastScan: true });
    state.loadScanned.mockResolvedValue({ files: [], folderTypes: {} });
    state.scanFilePaths.mockResolvedValue([]);

    await handler('library:addFiles')({}, ['/a']);

    expect(state.scanFilePaths).toHaveBeenCalledWith(['/a'], expect.any(Map), true);
  });

  it('treats an unavailable store as fastScan=false', async () => {
    state.store.get.mockImplementation(() => {
      throw new Error('no store');
    });
    state.loadScanned.mockResolvedValue({ files: [], folderTypes: {} });
    state.scanFilePaths.mockResolvedValue([]);

    await handler('library:addFiles')({}, ['/a']);

    expect(state.scanFilePaths).toHaveBeenCalledWith(['/a'], expect.any(Map), false);
    expect(state.logger.warn).toHaveBeenCalled();
  });
});

describe('loudness analysis', () => {
  it('returns zeros without library data', async () => {
    await expect(handler('library:analyzeLoudness')({ sender: sender() })).resolves.toEqual({
      analyzed: 0,
      albums: 0,
      failed: 0,
      aborted: false,
      truncated: false,
      updated: 0
    });
  });

  it('applies updates, reports progress and broadcasts', async () => {
    state.loadScanned.mockResolvedValue({ files: [{ path: '/a' }] });
    state.analyze.mockImplementation(async (_files, _signal, progress) => {
      progress({ analyzed: 1, total: 2 });
      return {
        updates: [{ path: '/a', gain: 1 }],
        summary: { analyzed: 1, albums: 0, failed: 0, aborted: false, truncated: false }
      };
    });
    state.applyLoudness.mockReturnValue(1);
    const event = { sender: sender() };

    const result = await handler('library:analyzeLoudness')(event);

    expect(result).toMatchObject({ analyzed: 1, updated: 1 });
    expect(event.sender.send).toHaveBeenCalledWith('library:loudness:progress', {
      analyzed: 1,
      total: 2
    });
    expect(state.flushScanned).toHaveBeenCalled();
    expect(state.broadcast).toHaveBeenCalledWith('library:updated');
  });

  it('skips progress for destroyed senders and avoids flushing when nothing changed', async () => {
    state.loadScanned.mockResolvedValue({ files: [] });
    state.analyze.mockImplementation(async (_files, _signal, progress) => {
      progress({ analyzed: 0, total: 0 });
      return {
        updates: [],
        summary: { analyzed: 0, albums: 0, failed: 0, aborted: false, truncated: false }
      };
    });
    const event = { sender: sender(true) };

    await handler('library:analyzeLoudness')(event);

    expect(event.sender.send).not.toHaveBeenCalled();
    expect(state.flushScanned).not.toHaveBeenCalled();
  });

  it('reports analysis errors and aborts the previous run', async () => {
    const first = deferred<unknown>();
    state.loadScanned.mockResolvedValue({ files: [] });
    state.analyze.mockReturnValueOnce(first.promise);
    const firstRun = handler('library:analyzeLoudness')({ sender: sender() });

    state.analyze.mockRejectedValueOnce(new Error('decode'));
    const result = await handler('library:analyzeLoudness')({ sender: sender() });

    expect(result).toMatchObject({ error: 'decode', updated: 0 });
    const firstSignal = state.analyze.mock.calls[0][1] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);

    first.resolve({
      updates: [],
      summary: { analyzed: 0, albums: 0, failed: 0, aborted: true, truncated: false }
    });
    await firstRun;
  });

  it('cancel handler aborts the active analysis', async () => {
    const pending = deferred<unknown>();
    state.loadScanned.mockResolvedValue({ files: [] });
    state.analyze.mockReturnValueOnce(pending.promise);
    const run = handler('library:analyzeLoudness')({ sender: sender() });
    await vi.waitFor(() => expect(state.analyze).toHaveBeenCalled());

    expect(handler('library:loudnessCancel')({})).toBe(true);
    expect((state.analyze.mock.calls[0][1] as AbortSignal).aborted).toBe(true);

    pending.resolve({
      updates: [],
      summary: { analyzed: 0, albums: 0, failed: 0, aborted: true, truncated: false }
    });
    await run;
    cancelLibraryLoudness();
  });
});

describe('scanned payloads', () => {
  it('returns null without data and clamps chunk windows', async () => {
    await expect(handler('library:loadScannedChunk')({}, 0, 10)).resolves.toBeNull();

    const files = Array.from({ length: 10 }, (_, i) => ({ path: `/f${i}` }));
    state.loadScanned.mockResolvedValue({ files, folderTypes: { '/x': 'audio' } });
    await expect(handler('library:loadScannedChunk')({}, -5, 1_000_000)).resolves.toEqual({
      files,
      total: 10,
      folderTypes: { '/x': 'audio' }
    });
  });

  it('throws the E2E failure only when fixtures are enabled', async () => {
    state.e2e.mockReturnValue(true);
    process.env.ONDA_E2E_LIBRARY_FAIL = '1';
    await expect(handler('library:loadScannedChunk')({}, 0, 10)).rejects.toThrow(
      'E2E library load failure'
    );

    process.env.ONDA_E2E_LIBRARY_FAIL = '0';
    state.loadScanned.mockResolvedValue(null);
    await expect(handler('library:loadScannedChunk')({}, 0, 10)).resolves.toBeNull();
  });

  it('returns null when reading the cache fails', async () => {
    state.loadScanned.mockRejectedValue(new Error('io'));
    await expect(handler('library:loadScannedChunk')({}, 0, 10)).resolves.toBeNull();
    expect(state.logger.error).toHaveBeenCalled();
  });

  it('saves only sanitized payloads', async () => {
    state.sanitizeScanned.mockReturnValueOnce(null);
    await handler('library:saveScanned')({}, { bad: true });
    expect(state.setScanned).not.toHaveBeenCalled();
    expect(state.logger.warn).toHaveBeenCalled();

    const clean = { files: [], folderTypes: {} };
    state.sanitizeScanned.mockReturnValueOnce(clean);
    await handler('library:saveScanned')({}, clean);
    expect(state.setScanned).toHaveBeenCalledWith(clean);

    state.sanitizeScanned.mockImplementationOnce(() => {
      throw new Error('bad');
    });
    await expect(handler('library:saveScanned')({}, {})).resolves.toBeUndefined();
    expect(state.logger.error).toHaveBeenCalled();
  });

  it('updates stats only for valid entries with library data', async () => {
    await handler('library:updateStats')({}, []);
    expect(state.loadScanned).not.toHaveBeenCalled();

    await handler('library:updateStats')({}, [{ path: '/a', playCount: 1 }]);
    expect(state.updateStats).not.toHaveBeenCalled();

    state.loadScanned.mockResolvedValue({ files: [], folderTypes: {} });
    await handler('library:updateStats')({}, [
      { path: '/a', playCount: 2, lastPlayed: 3 },
      { path: '', playCount: 1 },
      { path: '/b', playCount: 'x' }
    ]);
    expect(state.updateStats).toHaveBeenCalledWith([{ path: '/a', playCount: 2, lastPlayed: 3 }]);

    state.loadScanned.mockRejectedValue(new Error('io'));
    await handler('library:updateStats')({}, [{ path: '/a', playCount: 1 }]);
    expect(state.logger.error).toHaveBeenCalled();
  });
});
