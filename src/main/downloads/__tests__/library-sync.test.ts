import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  store: null as any,
  getStore: vi.fn(),
  loadScanned: vi.fn(),
  setScanned: vi.fn(),
  scanDir: vi.fn(),
  classify: vi.fn(),
  filterFiles: vi.fn(),
  addFolder: vi.fn(),
  broadcast: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  lock: vi.fn(),
  lockCalls: [] as Array<() => Promise<unknown>>
}));

vi.mock('path', () => ({
  resolve: (path: string) => path.replace(/\\/g, '/'),
  dirname: (path: string) => path.replace(/\\/g, '/').slice(0, path.lastIndexOf('/')),
  sep: '/'
}));
vi.mock('../../ipc/cover/cover-cache', () => ({ getStore: state.getStore }));
vi.mock('../../ipc/library/library-store', () => ({
  loadLibraryScanned: state.loadScanned,
  setLibraryScanned: state.setScanned
}));
vi.mock('../../ipc/library/library-scan', () => ({
  scanDir: state.scanDir,
  classifyFolderType: state.classify,
  filterFilesForFolderType: state.filterFiles
}));
vi.mock('../../ipc/library/library-handlers', () => ({
  addLibraryFolder: state.addFolder
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: state.loggerInfo, error: vi.fn() }
}));
vi.mock('../../utils/broadcast', () => ({ broadcastToAllWindows: state.broadcast }));
vi.mock('../../utils/write-queue', () => ({
  createWriteLock: () => (task: () => Promise<unknown>) => {
    state.lock(task);
    return task();
  }
}));

async function load() {
  return import('../library-sync');
}

function media(path: string, overrides: Record<string, unknown> = {}) {
  return { path, name: path.split('/').pop(), type: 'audio', ...overrides } as any;
}

beforeEach(() => {
  state.store = {
    get: vi.fn((_key: string, fallback?: unknown) => fallback)
  };
  state.getStore.mockReset();
  state.getStore.mockResolvedValue(state.store);
  state.loadScanned.mockReset();
  state.loadScanned.mockResolvedValue({ files: [], folderTypes: {} });
  state.setScanned.mockReset();
  state.scanDir.mockReset();
  state.scanDir.mockResolvedValue({ files: [] });
  state.classify.mockReset();
  state.classify.mockReturnValue('audio');
  state.filterFiles.mockReset();
  state.filterFiles.mockImplementation((files: any[]) => files);
  state.addFolder.mockReset();
  state.addFolder.mockResolvedValue({ success: true });
  state.broadcast.mockReset();
  state.loggerInfo.mockReset();
  state.loggerWarn.mockReset();
  state.lock.mockReset();
});

describe('folder resolution', () => {
  it('skips files outside the library', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['C:/other'] : fallback
    );
    const { syncDownloadToLibrary } = await load();
    expect(await syncDownloadToLibrary('C:/downloads/a.mp3')).toEqual({ inLibrary: false });
    expect(state.scanDir).not.toHaveBeenCalled();
  });

  it('matches folders case-insensitively and with separators', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['c:/music'] : fallback
    );
    state.scanDir.mockResolvedValueOnce({ files: [media('c:/music/a.mp3')] });
    const { syncDownloadToLibrary } = await load();
    expect(await syncDownloadToLibrary('C:/Music/a.mp3')).toMatchObject({
      inLibrary: true,
      folder: 'c:/music'
    });
    expect(state.scanDir).toHaveBeenCalledWith('C:/Music', 0);
  });

  it('does not treat sibling prefixes as inside', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['C:/music'] : fallback
    );
    const { syncDownloadToLibrary } = await load();
    expect(await syncDownloadToLibrary('C:/music-other/a.mp3')).toEqual({ inLibrary: false });
  });

  it('forces adding the folder when requested', async () => {
    state.scanDir.mockResolvedValueOnce({ files: [media('C:/downloads/a.mp3')] });
    const { syncDownloadToLibrary } = await load();
    const result = await syncDownloadToLibrary('C:/downloads/a.mp3', { forceAdd: true });

    expect(state.addFolder).toHaveBeenCalledWith('C:/downloads');
    expect(result).toMatchObject({ inLibrary: true, folder: 'C:/downloads' });
  });

  it('adds the folder when the setting is enabled', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'download') return { autoAddDownloadFolder: true };
      return fallback;
    });
    const { syncDownloadToLibrary } = await load();
    const result = await syncDownloadToLibrary('C:/downloads/a.mp3');
    expect(state.addFolder).toHaveBeenCalledWith('C:/downloads');
    expect(result.inLibrary).toBe(true);
  });

  it('does not add folders when the setting is off', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) => {
      if (key === 'download') return { autoAddDownloadFolder: false };
      return fallback;
    });
    const { syncDownloadToLibrary } = await load();
    expect(await syncDownloadToLibrary('C:/downloads/a.mp3')).toEqual({ inLibrary: false });
    expect(state.addFolder).not.toHaveBeenCalled();
  });

  it('keeps downloaded folders when the add call fails', async () => {
    state.addFolder.mockRejectedValueOnce(new Error('locked'));
    const { syncDownloadToLibrary } = await load();
    expect(await syncDownloadToLibrary('C:/downloads/a.mp3', { forceAdd: true })).toEqual({
      inLibrary: false
    });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'library',
      'post-download library sync failed',
      expect.any(Error)
    );
  });
});

describe('library folder settings', () => {
  it('filters, trims and de-duplicates folder entries', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? [' A ', 5, 'A', '', ' B ', null] : fallback
    );
    state.scanDir.mockResolvedValueOnce({ files: [] });
    const { syncDownloadToLibrary } = await load();
    await syncDownloadToLibrary('A/a.mp3');
    expect(state.scanDir).toHaveBeenCalled();
    expect(state.addFolder).not.toHaveBeenCalled();
  });

  it('limits stored folders to one hundred entries', async () => {
    const folders = Array.from({ length: 120 }, (_, index) => `C:/f${index}`);
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? folders : fallback
    );
    const { syncDownloadToLibrary } = await load();
    await syncDownloadToLibrary('C:/f50/a.mp3');
    expect(state.scanDir).toHaveBeenCalledWith('C:/f50', 0);
  });

  it('returns no folders for invalid or throwing stores', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? 'not-an-array' : fallback
    );
    let module = await load();
    expect(await module.syncDownloadToLibrary('C:/a/a.mp3', { forceAdd: false })).toEqual({
      inLibrary: false
    });

    state.getStore.mockRejectedValueOnce(new Error('store'));
    state.addFolder.mockClear();
    module = await load();
    expect(await module.syncDownloadToLibrary('C:/a/a.mp3')).toEqual({ inLibrary: false });
    expect(state.addFolder).not.toHaveBeenCalled();
  });
});

describe('scanning and merging', () => {
  it('merges fresh files, records folder type and broadcasts', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['C:/music'] : fallback
    );
    const existing = media('C:/music/old.mp3', { playCount: 5 });
    const fresh = media('C:/music/new.mp3');
    state.loadScanned.mockResolvedValueOnce({
      files: [existing],
      folderTypes: {}
    });
    state.scanDir.mockResolvedValueOnce({ files: [existing, fresh] });
    state.classify.mockReturnValueOnce('audio');

    const { syncDownloadToLibrary } = await load();
    const result = await syncDownloadToLibrary('C:/music/new.mp3');

    expect(state.setScanned).toHaveBeenCalledWith({
      files: [existing, fresh],
      folderTypes: { 'C:/music': 'audio' }
    });
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'library',
      'post-download scan: +1 files in C:/music'
    );
    expect(state.broadcast).toHaveBeenCalledWith('library:updated', {
      folder: 'C:/music',
      added: 1
    });
    expect(result).toMatchObject({ inLibrary: true, file: fresh });
    expect(existing.playCount).toBe(5);
  });

  it('reuses known folder types and avoids a re-scan', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['C:/music'] : fallback
    );
    const existing = media('C:/music/old.mp3');
    state.loadScanned.mockResolvedValueOnce({
      files: [existing],
      folderTypes: { 'C:/music': 'video' }
    });
    state.scanDir.mockResolvedValueOnce({ files: [existing] });

    const { syncDownloadToLibrary } = await load();
    const result = await syncDownloadToLibrary('C:/music/old.mp3');
    expect(state.classify).not.toHaveBeenCalled();
    expect(state.filterFiles).toHaveBeenCalledWith([existing], 'video');
    expect(state.setScanned).not.toHaveBeenCalled();
    expect(state.broadcast).not.toHaveBeenCalled();
    expect(result.file).toBe(existing);
  });

  it('handles missing stored scans', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['C:/music'] : fallback
    );
    state.loadScanned.mockResolvedValueOnce(null);
    state.scanDir.mockResolvedValueOnce({ files: [media('C:/music/a.mp3')] });

    const { syncDownloadToLibrary } = await load();
    const result = await syncDownloadToLibrary('C:/music/a.mp3');
    expect(result.inLibrary).toBe(true);
    expect(state.setScanned).toHaveBeenCalled();
  });

  it('caps the stored file list at the maximum size', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['C:/music'] : fallback
    );
    const existing = Array.from({ length: 49_999 }, (_, index) =>
      media(`C:/music/old${index}.mp3`)
    );
    const fresh = [media('C:/music/new1.mp3'), media('C:/music/new2.mp3')];
    state.loadScanned.mockResolvedValueOnce({ files: existing, folderTypes: {} });
    state.scanDir.mockResolvedValueOnce({ files: [...existing, ...fresh] });

    const { syncDownloadToLibrary } = await load();
    await syncDownloadToLibrary('C:/music/new1.mp3');
    expect(state.setScanned.mock.calls[0][0].files).toHaveLength(50_000);
  });

  it('returns no file when the download is not part of the scan', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['C:/music'] : fallback
    );
    state.scanDir.mockResolvedValueOnce({ files: [media('C:/music/other.mp3')] });
    const { syncDownloadToLibrary } = await load();
    const result = await syncDownloadToLibrary('C:/music/missing.mp3');
    expect(result).toMatchObject({ inLibrary: true, folder: 'C:/music' });
    expect(result.file).toBeUndefined();
  });

  it('wraps work in the write lock', async () => {
    const { syncDownloadToLibrary } = await load();
    await syncDownloadToLibrary('C:/music/a.mp3');
    expect(state.lock).toHaveBeenCalledTimes(1);
  });

  it('reports scan failures', async () => {
    state.store.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'libraryFolders' ? ['C:/music'] : fallback
    );
    state.scanDir.mockRejectedValueOnce(new Error('scan'));
    const { syncDownloadToLibrary } = await load();
    expect(await syncDownloadToLibrary('C:/music/a.mp3')).toEqual({ inLibrary: false });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'library',
      'post-download library sync failed',
      expect.any(Error)
    );
  });

  it('handles empty output paths', async () => {
    const { syncDownloadToLibrary } = await load();
    expect(await syncDownloadToLibrary('')).toEqual({ inLibrary: false });
  });
});
