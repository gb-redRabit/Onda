import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  getAllWindows: vi.fn((..._args: any[]) => [] as any[]),
  readCoverMap: vi.fn(),
  writeCoverMap: vi.fn(),
  scheduleCoverMapWrite: vi.fn(),
  parseFile: vi.fn(),
  sharp: vi.fn(),
  clearDirContents: vi.fn(),
  runCommand: vi.fn(),
  resolveBin: vi.fn(),
  sibling: null as string | null,
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('fs/promises', () => ({
  stat: h.stat,
  readFile: h.readFile,
  writeFile: h.writeFile,
  mkdir: h.mkdir,
  unlink: h.unlink,
  readdir: h.readdir,
  rm: h.rm
}));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: h.getAllWindows } }));
vi.mock('../cover/cover-map', () => ({
  readCoverMap: h.readCoverMap,
  writeCoverMap: h.writeCoverMap,
  scheduleCoverMapWrite: h.scheduleCoverMapWrite
}));
vi.mock('../cover/cover-cache-helpers', () => ({
  evictCache: (map: Map<string, unknown>, maxSize: number) => {
    while (map.size > maxSize) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  },
  hashPath: (value: string) => `hash-${value.length}`,
  uniqueId: () => 'id1',
  findSiblingVideo: () => h.sibling,
  isEnoent: (error: unknown) => (error as { code?: string } | null)?.code === 'ENOENT'
}));
vi.mock('../../utils/lazy-music-metadata', () => ({
  loadMusicMetadata: async () => ({ parseFile: h.parseFile })
}));
vi.mock('../../utils/lazy-sharp', () => ({ loadSharp: async () => h.sharp }));
vi.mock('../../utils/clear-dir', () => ({ clearDirContents: h.clearDirContents }));
vi.mock('../../utils/exec', () => ({ runCommand: h.runCommand }));
vi.mock('../../binaries', () => ({ resolveBin: h.resolveBin }));
vi.mock('../../../shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: h.loggerWarn, error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  return import('../cover/cover-cache');
}

async function flush(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

function enoent() {
  const error = new Error('ENOENT') as Error & { code: string };
  error.code = 'ENOENT';
  return error;
}

function sharpChain(output = Buffer.from('resized')) {
  const chain = {
    resize: vi.fn(() => chain),
    jpeg: vi.fn(() => chain),
    toBuffer: vi.fn(async () => output)
  };
  return chain;
}

function picture() {
  return {
    common: {
      picture: [{ format: 'image/jpeg', data: new Uint8Array([1, 2, 3]) }]
    }
  };
}

beforeEach(() => {
  h.stat.mockReset();
  h.stat.mockResolvedValue({ mtimeMs: 100 });
  h.readFile.mockReset();
  h.readFile.mockResolvedValue(Buffer.from('img'));
  h.writeFile.mockReset();
  h.writeFile.mockResolvedValue(undefined);
  h.mkdir.mockReset();
  h.mkdir.mockResolvedValue(undefined);
  h.unlink.mockReset();
  h.unlink.mockResolvedValue(undefined);
  h.readdir.mockReset();
  h.readdir.mockResolvedValue([]);
  h.rm.mockReset();
  h.rm.mockResolvedValue(undefined);
  h.getAllWindows.mockReset();
  h.getAllWindows.mockReturnValue([]);
  h.readCoverMap.mockReset();
  h.readCoverMap.mockResolvedValue({});
  h.writeCoverMap.mockReset();
  h.writeCoverMap.mockResolvedValue(undefined);
  h.scheduleCoverMapWrite.mockReset();
  h.parseFile.mockReset();
  h.parseFile.mockResolvedValue({ common: {} });
  h.sharp.mockReset();
  h.sharp.mockReturnValue(sharpChain());
  h.clearDirContents.mockReset();
  h.clearDirContents.mockResolvedValue({ removed: 3, bytesFreed: 99 });
  h.runCommand.mockReset();
  h.runCommand.mockResolvedValue(undefined);
  h.resolveBin.mockReset();
  h.resolveBin.mockResolvedValue('/ffmpeg');
  h.sibling = null;
  h.loggerInfo.mockReset();
  h.loggerWarn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('extractAndCacheCover', () => {
  it('uses a sibling video as the cover', async () => {
    h.sibling = 'D:/music/a.mp4';
    const covers = await load();

    await expect(covers.extractAndCacheCover('D:/music/a.mp3')).resolves.toEqual({
      type: 'video',
      data: 'D:/music/a.mp4'
    });
  });

  it('extracts and resizes embedded audio art', async () => {
    h.parseFile.mockResolvedValueOnce(picture());
    const covers = await load();

    const result = await covers.extractAndCacheCover('D:/music/a.mp3');
    await flush();

    expect(result).toEqual({
      type: 'image',
      data: `data:image/jpeg;base64,${Buffer.from('resized').toString('base64')}`
    });
    expect(h.sharp).toHaveBeenCalled();
    expect(h.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('hash-'),
      Buffer.from('resized')
    );
    expect(h.scheduleCoverMapWrite).toHaveBeenCalled();
  });

  it('keeps the original art when resizing fails', async () => {
    h.parseFile.mockResolvedValueOnce(picture());
    h.sharp.mockImplementationOnce(() => {
      throw new Error('no sharp');
    });
    const covers = await load();

    const result = await covers.extractAndCacheCover('D:/music/a.mp3');
    await flush();

    expect(result).toEqual({
      type: 'image',
      data: `data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString('base64')}`
    });
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'cover',
      'cover resize failed for D:/music/a.mp3',
      expect.any(Error)
    );
  });

  it('falls back to an embedded frame without audio art', async () => {
    const covers = await load();

    await expect(covers.extractAndCacheCover('D:/music/a.mp3')).resolves.toEqual({
      type: 'image',
      data: `data:image/jpeg;base64,${Buffer.from('img').toString('base64')}`
    });
    expect(h.runCommand).toHaveBeenCalled();
  });

  it('records missing files and notifies windows', async () => {
    const send = vi.fn();
    h.getAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send } }]);
    h.parseFile.mockRejectedValueOnce(enoent());
    const covers = await load();

    await expect(covers.extractAndCacheCover('D:/music/gone.mp3')).resolves.toEqual({
      type: null,
      data: null
    });
    expect(send).toHaveBeenCalledWith('library:fileMissing', 'D:/music/gone.mp3');
    expect(h.loggerInfo).toHaveBeenCalledWith(
      'cover',
      'file missing, skip cover for D:/music/gone.mp3'
    );

    h.stat.mockClear();
    await covers.extractAndCacheCover('D:/music/gone.mp3');
    expect(h.stat).not.toHaveBeenCalled();
  });

  it('falls back when metadata parsing fails for other reasons', async () => {
    h.parseFile.mockRejectedValueOnce(new Error('corrupt'));
    const covers = await load();

    await expect(covers.extractAndCacheCover('D:/music/a.mp3')).resolves.toMatchObject({
      type: 'image'
    });
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'cover',
      'no cover in metadata for D:/music/a.mp3',
      expect.any(Error)
    );
  });

  it('extracts a video frame', async () => {
    const covers = await load();

    await expect(covers.extractAndCacheCover('D:/video/a.mp4')).resolves.toEqual({
      type: 'image',
      data: `data:image/jpeg;base64,${Buffer.from('img').toString('base64')}`
    });
  });

  it('returns null when the video frame cannot be extracted', async () => {
    h.runCommand.mockRejectedValueOnce(new Error('ffmpeg'));
    const covers = await load();

    await expect(covers.extractAndCacheCover('D:/video/a.mp4')).resolves.toEqual({
      type: null,
      data: null
    });
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'cover',
      'extractVideoFrame failed for D:/video/a.mp4',
      expect.any(Error)
    );
  });

  it('deduplicates concurrent extraction through the file lock', async () => {
    let release!: (value: { common: object }) => void;
    h.parseFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const covers = await load();

    const first = covers.extractAndCacheCover('D:/music/a.mp3');
    await flush();
    const second = covers.extractAndCacheCover('D:/music/a.mp3');
    await flush();
    release({ common: {} });

    const [a, b] = await Promise.all([first, second]);
    expect(h.parseFile).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it('reads persistent covers from disk', async () => {
    h.readCoverMap.mockResolvedValue({
      'D:/music/a.mp3': { cacheFile: 'abc.jpg', mtime: 200 }
    });
    const covers = await load();

    const result = await covers.extractAndCacheCover('D:/music/a.mp3');

    expect(result).toEqual({
      type: 'image',
      data: `data:image/jpeg;base64,${Buffer.from('img').toString('base64')}`
    });
    expect(h.parseFile).not.toHaveBeenCalled();
  });

  it('drops stale persistent entries and re-extracts', async () => {
    h.readCoverMap.mockResolvedValue({
      'D:/music/a.mp3': { cacheFile: 'abc.jpg', mtime: 50 }
    });
    const covers = await load();

    await covers.extractAndCacheCover('D:/music/a.mp3');

    expect(h.writeCoverMap).toHaveBeenCalledWith({});
    expect(h.parseFile).toHaveBeenCalled();
  });

  it('ignores persistent maps that cannot be read', async () => {
    h.readCoverMap.mockRejectedValueOnce(new Error('map'));
    const covers = await load();

    await expect(covers.extractAndCacheCover('D:/music/a.mp3')).resolves.toMatchObject({
      type: 'image'
    });
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'cover',
      expect.stringContaining('failed for D:/music/a.mp3'),
      expect.any(Error)
    );
  });

  it('logs persistent write failures', async () => {
    h.parseFile.mockResolvedValueOnce(picture());
    h.writeFile.mockRejectedValueOnce(new Error('disk'));
    const covers = await load();

    await covers.extractAndCacheCover('D:/music/a.mp3');
    await flush();

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'cover',
      expect.stringContaining('savePersistentCover failed'),
      expect.any(Error)
    );
  });

  it('drops persistent entries when the source cannot be stat`ed', async () => {
    h.readCoverMap.mockResolvedValue({
      'D:/music/a.mp3': { cacheFile: 'abc.jpg', mtime: 200 }
    });
    h.stat.mockResolvedValueOnce({ mtimeMs: 100 }).mockRejectedValueOnce(new Error('stat'));
    const covers = await load();

    await covers.extractAndCacheCover('D:/music/a.mp3');

    expect(h.writeCoverMap).toHaveBeenCalledWith({});
    expect(h.parseFile).toHaveBeenCalled();
  });

  it('falls back to the current time when saving without stat data', async () => {
    h.parseFile.mockResolvedValueOnce(picture());
    h.stat.mockResolvedValueOnce({ mtimeMs: 100 }).mockRejectedValueOnce(new Error('stat'));
    const covers = await load();

    await covers.extractAndCacheCover('D:/music/a.mp3');
    await flush();

    expect(h.scheduleCoverMapWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        'D:/music/a.mp3': expect.objectContaining({ mtime: expect.any(Number) })
      })
    );
  });

  it('caches disk covers even when the source stat fails', async () => {
    h.readCoverMap.mockResolvedValue({
      'D:/music/a.mp3': { cacheFile: 'abc.jpg', mtime: 200 }
    });
    h.stat
      .mockResolvedValueOnce({ mtimeMs: 100 })
      .mockResolvedValueOnce({ mtimeMs: 100 })
      .mockRejectedValueOnce(new Error('stat'));
    const covers = await load();

    await expect(covers.extractAndCacheCover('D:/music/a.mp3')).resolves.toMatchObject({
      type: 'image'
    });
  });

  it('revalidates cached entries after the stat TTL', async () => {
    vi.useFakeTimers();
    const covers = await load();
    await covers.extractAndCacheCover('D:/music/a.mp3');

    vi.setSystemTime(Date.now() + 61_000);
    h.stat.mockResolvedValueOnce({ mtimeMs: 100 }).mockRejectedValueOnce(new Error('stat'));
    h.parseFile.mockClear();

    await covers.extractAndCacheCover('D:/music/a.mp3');

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'cover',
      'mem cache size check failed for D:/music/a.mp3',
      expect.any(Error)
    );
  });
});

describe('still frames', () => {
  it('returns image covers directly', async () => {
    h.parseFile.mockResolvedValueOnce(picture());
    const covers = await load();

    await expect(covers.extractAndCacheStill('D:/music/a.mp3')).resolves.toMatchObject({
      type: 'image'
    });
  });

  it('returns empty for files without a cover', async () => {
    h.sibling = null;
    h.parseFile.mockResolvedValueOnce({ common: {} });
    h.runCommand.mockRejectedValue(new Error('none'));
    const covers = await load();

    await expect(covers.extractAndCacheStill('D:/music/a.mp3')).resolves.toEqual({
      type: null,
      data: null
    });
  });

  it('reuses a persisted still for sibling videos', async () => {
    h.sibling = 'D:/music/a.mp4';
    h.readCoverMap.mockImplementation(async () => ({
      'still:D:/music/a.mp3': { cacheFile: 'still.jpg', mtime: 500 }
    }));
    const covers = await load();

    await expect(covers.extractAndCacheStill('D:/music/a.mp3')).resolves.toEqual({
      type: 'image',
      data: `data:image/jpeg;base64,${Buffer.from('img').toString('base64')}`
    });
  });

  it('extracts and persists a still when missing', async () => {
    h.sibling = 'D:/music/a.mp4';
    const covers = await load();

    await expect(covers.extractAndCacheStill('D:/music/a.mp3')).resolves.toMatchObject({
      type: 'image'
    });
    await flush();
    expect(h.scheduleCoverMapWrite).toHaveBeenCalled();
  });

  it('returns empty when the still frame cannot be extracted', async () => {
    h.sibling = 'D:/music/a.mp4';
    h.runCommand.mockRejectedValueOnce(new Error('ffmpeg'));
    const covers = await load();

    await expect(covers.extractAndCacheStill('D:/music/a.mp3')).resolves.toEqual({
      type: null,
      data: null
    });
  });
});

describe('cache maintenance', () => {
  it('clears memory and persistent caches', async () => {
    const covers = await load();
    await expect(covers.clearCoverCache()).resolves.toEqual({ removed: 3, bytesFreed: 99 });
    expect(h.clearDirContents).toHaveBeenCalled();
    expect(h.writeCoverMap).toHaveBeenCalledWith({});
  });

  it('reports clear failures as empty results', async () => {
    h.clearDirContents.mockRejectedValueOnce(new Error('locked'));
    const covers = await load();

    await expect(covers.clearCoverCache()).resolves.toEqual({ removed: 0, bytesFreed: 0 });
    expect(h.loggerWarn).toHaveBeenCalledWith('cover', 'clearCoverCache failed', expect.any(Error));
  });

  it('migrates stale caches once', async () => {
    h.readdir.mockResolvedValue(['a.jpg', '.', '..']);
    const covers = await load();

    await covers.initCoverCache();

    expect(h.rm).toHaveBeenCalledTimes(1);
    expect(h.rm).toHaveBeenCalledWith(expect.stringContaining('a.jpg'), { force: true });
    expect(h.writeCoverMap).toHaveBeenCalledWith(
      expect.objectContaining({ __v2_sibling_video__: expect.any(Object) })
    );
    expect(h.loggerInfo).toHaveBeenCalledWith(
      'cover',
      'persistent cover cache cleared for sibling video migration'
    );
  });

  it('skips migration when already done', async () => {
    h.readCoverMap.mockResolvedValue({ __v2_sibling_video__: { cacheFile: '', mtime: 1 } });
    const covers = await load();

    await covers.initCoverCache();

    expect(h.readdir).not.toHaveBeenCalled();
    expect(h.writeCoverMap).not.toHaveBeenCalled();
  });

  it('tolerates unreadable cache directories and write failures', async () => {
    h.readdir.mockRejectedValueOnce(new Error('missing'));
    h.writeCoverMap.mockRejectedValueOnce(new Error('disk'));
    const covers = await load();

    await covers.initCoverCache();

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'cover',
      'stale cache cleanup failed',
      expect.any(Error)
    );
  });

  it('logs notification failures for missing files', async () => {
    h.getAllWindows.mockImplementation(() => {
      throw new Error('windows');
    });
    h.parseFile.mockRejectedValueOnce(enoent());
    const covers = await load();

    await covers.extractAndCacheCover('D:/music/gone.mp3');

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'cover',
      'notifyMissing failed for D:/music/gone.mp3',
      expect.any(Error)
    );
  });

  it('bounds the missing-file cache', async () => {
    h.stat.mockRejectedValue(enoent());
    const covers = await load();

    for (let i = 0; i < 2001; i += 1) {
      await covers.extractAndCacheCover(`D:/music/gone-${i}.mp3`);
    }

    expect(h.loggerInfo).toHaveBeenCalledTimes(2001);
  });
});
