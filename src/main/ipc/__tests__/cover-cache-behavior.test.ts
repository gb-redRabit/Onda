import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Zachowanie cache okładek: dysk jest w pełni mockowany, bo interesuje nas
// polityka (TTL, wersjonowanie mtime, promocja z dysku, migracja), a nie fs.
const state = vi.hoisted(() => ({
  clock: 1_000_000,
  files: new Map<string, Buffer>(),
  stat: vi.fn(async (_path?: string) => ({ mtimeMs: 100 })),
  readFile: vi.fn(async (path: string) => {
    const data = state.files.get(path);
    if (!data) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return data;
  }),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
  readdir: vi.fn(async () => [] as string[]),
  rm: vi.fn(async () => undefined),
  readCoverMap: vi.fn(
    async (): Promise<Record<string, { cacheFile: string; mtime: number }>> => ({})
  ),
  writeCoverMap: vi.fn(async () => undefined),
  scheduleCoverMapWrite: vi.fn(),
  findSiblingVideo: vi.fn((): string | null => null),
  parseFile: vi.fn(async () => ({ common: {}, format: {} })),
  runCommand: vi.fn(async (_bin?: string, _args?: string[], _opts?: unknown) => ''),
  resolveBin: vi.fn(async () => '/usr/bin/ffmpeg'),
  clearDirContents: vi.fn(async () => ({ removed: 0, bytesFreed: 0 })),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  windows: [] as Array<{
    isDestroyed: () => boolean;
    webContents: { send: ReturnType<typeof vi.fn> };
  }>
}));

vi.mock('fs/promises', () => {
  const mod = {
    stat: (...args: [string]) => state.stat(...args),
    readFile: (...args: [string]) => state.readFile(...args),
    writeFile: (...args: unknown[]) => state.writeFile(...(args as [])),
    mkdir: (...args: unknown[]) => state.mkdir(...(args as [])),
    unlink: (...args: unknown[]) => state.unlink(...(args as [])),
    readdir: (...args: unknown[]) => state.readdir(...(args as [])),
    rm: (...args: unknown[]) => state.rm(...(args as []))
  };
  return { ...mod, default: mod };
});
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => state.windows }
}));
vi.mock('../cover/cover-map', () => ({
  readCoverMap: state.readCoverMap,
  writeCoverMap: state.writeCoverMap,
  scheduleCoverMapWrite: state.scheduleCoverMapWrite
}));
vi.mock('../cover/cover-cache-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cover/cover-cache-helpers')>();
  return { ...actual, findSiblingVideo: state.findSiblingVideo };
});
vi.mock('../../utils/lazy-music-metadata', () => ({
  loadMusicMetadata: async () => ({ parseFile: state.parseFile })
}));
vi.mock('../../utils/lazy-sharp', () => ({
  loadSharp: async () => {
    throw new Error('sharp unavailable in tests');
  }
}));
vi.mock('../../utils/exec', () => ({ runCommand: state.runCommand }));
vi.mock('../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../utils/clear-dir', () => ({ clearDirContents: state.clearDirContents }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: state.loggerInfo, error: vi.fn() }
}));

const {
  getTempDir,
  applyCoverCacheSettings,
  getCachedDuration,
  setCachedDuration,
  deleteCachedDuration,
  invalidateCachedCover,
  clearCoverCache,
  initCoverCache,
  extractAndCacheCover,
  extractAndCacheStill
} = await import('../cover/cover-cache');

const PERSISTENT = join(getTempDir(), 'persistent');
const STALE_KEY = '__v2_sibling_video__';

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  state.files.clear();
  state.stat.mockReset();
  state.stat.mockResolvedValue({ mtimeMs: 100 });
  state.readFile.mockClear();
  state.writeFile.mockClear();
  state.mkdir.mockClear();
  state.unlink.mockClear();
  state.readdir.mockReset();
  state.readdir.mockResolvedValue([]);
  state.rm.mockClear();
  state.readCoverMap.mockReset();
  state.readCoverMap.mockResolvedValue({});
  state.writeCoverMap.mockClear();
  state.scheduleCoverMapWrite.mockClear();
  state.findSiblingVideo.mockReset();
  state.findSiblingVideo.mockReturnValue(null);
  state.parseFile.mockReset();
  state.parseFile.mockResolvedValue({ common: {}, format: {} });
  state.runCommand.mockReset();
  state.runCommand.mockResolvedValue('');
  state.resolveBin.mockResolvedValue('/usr/bin/ffmpeg');
  state.clearDirContents.mockReset();
  state.clearDirContents.mockResolvedValue({ removed: 0, bytesFreed: 0 });
  state.windows = [];
  state.clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => state.clock);
  applyCoverCacheSettings(5000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function advance(ms: number): void {
  state.clock += ms;
}

function dataUrl(buffer: Buffer, mime = 'jpeg'): string {
  return `data:image/${mime};base64,${buffer.toString('base64')}`;
}

describe('cache settings and duration entries', () => {
  it('builds the cover temp directory under the OS temp folder', () => {
    expect(getTempDir()).toBe(join(tmpdir(), 'onda-covers'));
  });

  it('evicts the oldest durations above the configured entry limit', () => {
    applyCoverCacheSettings(2);
    setCachedDuration('/a', { duration: 1, mtimeMs: 1 });
    setCachedDuration('/b', { duration: 2, mtimeMs: 2 });
    setCachedDuration('/c', { duration: 3, mtimeMs: 3 });

    expect(getCachedDuration('/a')).toBeUndefined();
    expect(getCachedDuration('/b')).toEqual({ duration: 2, mtimeMs: 2 });
    expect(getCachedDuration('/c')).toEqual({ duration: 3, mtimeMs: 3 });
  });

  it('ignores invalid entry limits', () => {
    applyCoverCacheSettings(5000);
    setCachedDuration('/keep', { duration: 1, mtimeMs: 1 });
    applyCoverCacheSettings(0);
    applyCoverCacheSettings(Number.NaN);
    applyCoverCacheSettings(-3);
    setCachedDuration('/also-keep', { duration: 2, mtimeMs: 2 });
    expect(getCachedDuration('/keep')).toBeDefined();
    expect(getCachedDuration('/also-keep')).toBeDefined();
  });

  it('deletes a duration entry explicitly', () => {
    setCachedDuration('/delete-me', { duration: 1, mtimeMs: 1 });
    deleteCachedDuration('/delete-me');
    expect(getCachedDuration('/delete-me')).toBeUndefined();
  });
});

describe('clearCoverCache', () => {
  it('clears memory, persistent files and the cover map', async () => {
    setCachedDuration('/d', { duration: 1, mtimeMs: 1 });
    state.clearDirContents.mockResolvedValue({ removed: 3, bytesFreed: 512 });

    await expect(clearCoverCache()).resolves.toEqual({ removed: 3, bytesFreed: 512 });

    expect(state.clearDirContents).toHaveBeenCalledWith(PERSISTENT);
    expect(state.writeCoverMap).toHaveBeenCalledWith({});
    expect(getCachedDuration('/d')).toBeUndefined();
  });

  it('returns zeros and logs when clearing fails', async () => {
    state.clearDirContents.mockRejectedValue(new Error('locked'));

    await expect(clearCoverCache()).resolves.toEqual({ removed: 0, bytesFreed: 0 });
    expect(state.loggerWarn).toHaveBeenCalled();
  });
});

describe('initCoverCache', () => {
  it('does nothing when the migration marker is present', async () => {
    state.readCoverMap.mockResolvedValue({ [STALE_KEY]: { cacheFile: '', mtime: 1 } });

    await initCoverCache();

    expect(state.readdir).not.toHaveBeenCalled();
    expect(state.writeCoverMap).not.toHaveBeenCalled();
  });

  it('removes old cache files once and writes the marker', async () => {
    state.readdir.mockResolvedValue(['old.jpg', '.', '..']);

    await initCoverCache();

    expect(state.rm).toHaveBeenCalledTimes(1);
    expect(state.rm).toHaveBeenCalledWith(join(PERSISTENT, 'old.jpg'), { force: true });
    expect(state.writeCoverMap).toHaveBeenCalledWith({
      [STALE_KEY]: { cacheFile: '', mtime: expect.any(Number) }
    });
    expect(state.loggerInfo).toHaveBeenCalled();
  });

  it('swallows failures during migration', async () => {
    state.readCoverMap.mockRejectedValue(new Error('broken map'));
    await initCoverCache();
    expect(state.loggerWarn).toHaveBeenCalled();
  });
});

describe('missing files', () => {
  it('notifies live windows once and caches the miss for the TTL', async () => {
    const path = '/music/missing-file.mp3';
    state.stat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const live = { isDestroyed: () => false, webContents: { send: vi.fn() } };
    const dead = { isDestroyed: () => true, webContents: { send: vi.fn() } };
    state.windows = [live, dead];

    await expect(extractAndCacheCover(path)).resolves.toEqual({ type: null, data: null });
    await expect(extractAndCacheCover(path)).resolves.toEqual({ type: null, data: null });

    expect(state.stat).toHaveBeenCalledTimes(1);
    expect(live.webContents.send).toHaveBeenCalledWith('library:fileMissing', path);
    expect(dead.webContents.send).not.toHaveBeenCalled();

    advance(5 * 60 * 1000 + 1);
    await extractAndCacheCover(path);
    expect(state.stat).toHaveBeenCalledTimes(2);
  });
});

describe('persistent cover lookup', () => {
  it('promotes a jpeg entry from disk into memory', async () => {
    const file = '/music/persistent.mp3';
    const cachePath = join(PERSISTENT, 'abc.jpg');
    state.readCoverMap.mockResolvedValue({ [file]: { cacheFile: 'abc.jpg', mtime: 200 } });
    state.files.set(cachePath, Buffer.from('jpg'));

    await expect(extractAndCacheCover(file)).resolves.toEqual({
      type: 'image',
      data: dataUrl(Buffer.from('jpg'))
    });
    expect(state.stat).toHaveBeenCalledWith(file);
  });

  it('uses the png data url for png entries', async () => {
    const file = '/music/persistent-png.mp3';
    state.readCoverMap.mockResolvedValue({ [file]: { cacheFile: 'abc.png', mtime: 200 } });
    state.files.set(join(PERSISTENT, 'abc.png'), Buffer.from('png'));

    const result = await extractAndCacheCover(file);
    expect(result.data).toBe(dataUrl(Buffer.from('png'), 'png'));
  });

  it('drops an entry when the source mtime moved past it', async () => {
    const file = '/music/stale.mp3';
    state.readCoverMap.mockResolvedValue({ [file]: { cacheFile: 'old.jpg', mtime: 50 } });

    await extractAndCacheCover(file);

    expect(state.writeCoverMap).toHaveBeenCalledWith({});
  });

  it('ignores an entry whose file disappeared from disk', async () => {
    const file = '/music/no-file-cache.mp3';
    state.readCoverMap.mockResolvedValue({ [file]: { cacheFile: 'gone.jpg', mtime: 200 } });

    await expect(extractAndCacheCover(file)).resolves.toEqual({ type: null, data: null });
  });
});

describe('in-memory cache', () => {
  it('serves a fresh entry without an extra revalidation stat', async () => {
    const file = '/music/cached.jpg';

    await extractAndCacheCover(file);
    await extractAndCacheCover(file);

    // Jeden stat na wywołanie (mtime wpisu) i żaden dodatkowy z getCachedCover.
    expect(state.stat).toHaveBeenCalledTimes(2);
  });

  it('revalidates stale entries once the 60s TTL passes', async () => {
    const file = '/music/ttl.jpg';
    await extractAndCacheCover(file);
    advance(60_001);
    await extractAndCacheCover(file);
    // Dwa staty z extractAndCacheCover + jeden rewalidacyjny w getCachedCover.
    expect(state.stat).toHaveBeenCalledTimes(3);
  });

  it('refreshes an entry when the file mtime changed', async () => {
    const file = '/music/rewritten.jpg';
    await extractAndCacheCover(file);
    advance(60_001);
    state.stat.mockResolvedValue({ mtimeMs: 200 });
    await extractAndCacheCover(file);
    expect(state.stat).toHaveBeenCalledTimes(3);
  });

  it('invalidateCachedCover forces a new stat', async () => {
    const file = '/music/invalidate.jpg';
    await extractAndCacheCover(file);
    invalidateCachedCover(file);
    await extractAndCacheCover(file);
    expect(state.stat).toHaveBeenCalledTimes(2);
  });
});

describe('cover extraction branches', () => {
  it('returns a sibling video instead of extracting a frame', async () => {
    const file = '/music/song.mp3';
    state.findSiblingVideo.mockReturnValue('/music/song.mp4');

    await expect(extractAndCacheCover(file)).resolves.toEqual({
      type: 'video',
      data: '/music/song.mp4'
    });
    expect(state.parseFile).not.toHaveBeenCalled();
  });

  it('extracts an embedded audio picture', async () => {
    const file = '/music/with-cover.mp3';
    state.parseFile.mockResolvedValue({
      common: {
        picture: [{ data: new Uint8Array([1, 2, 3]), format: 'image/jpeg' }]
      },
      format: {}
    });

    const result = await extractAndCacheCover(file);

    expect(result).toEqual({ type: 'image', data: dataUrl(Buffer.from([1, 2, 3])) });
    await vi.waitFor(() => expect(state.writeFile).toHaveBeenCalled());
  });

  it('falls back to an embedded ffmpeg cover when metadata has no picture', async () => {
    const file = '/music/ffmpeg-cover.mp3';
    state.parseFile.mockResolvedValue({ common: {}, format: {} });
    state.runCommand.mockImplementation(async (_bin?: string, args?: string[]) => {
      const out = args?.at(-2);
      if (out) state.files.set(out, Buffer.from('frame'));
      return '';
    });

    const result = await extractAndCacheCover(file);

    expect(result).toEqual({ type: 'image', data: dataUrl(Buffer.from('frame')) });
    expect(state.runCommand).toHaveBeenCalledWith(
      '/usr/bin/ffmpeg',
      expect.arrayContaining(['-i', file, '-vframes', '1']),
      { timeout: 15000 }
    );
  });

  it('extracts a video frame and caches the null path for unknown extensions', async () => {
    const video = '/music/clip.mp4';
    state.runCommand.mockImplementation(async (_bin?: string, args?: string[]) => {
      const out = args?.at(-2);
      if (out) state.files.set(out, Buffer.from('video-frame'));
      return '';
    });

    await expect(extractAndCacheCover(video)).resolves.toEqual({
      type: 'image',
      data: dataUrl(Buffer.from('video-frame'))
    });

    await expect(extractAndCacheCover('/music/document.pdf')).resolves.toEqual({
      type: null,
      data: null
    });
  });

  it('returns null when ffmpeg produces no file', async () => {
    state.runCommand.mockRejectedValue(new Error('ffmpeg failed'));
    await expect(extractAndCacheCover('/music/broken.mp4')).resolves.toEqual({
      type: null,
      data: null
    });
  });
});

describe('extractAndCacheStill', () => {
  it('passes an image cover through', async () => {
    const file = '/music/still-image.mp3';
    state.parseFile.mockResolvedValue({
      common: { picture: [{ data: new Uint8Array([7]), format: 'image/png' }] },
      format: {}
    });

    await expect(extractAndCacheStill(file)).resolves.toEqual({
      type: 'image',
      data: dataUrl(Buffer.from([7]), 'jpeg')
    });
  });

  it('returns null when there is no cover', async () => {
    state.stat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(extractAndCacheStill('/music/none.mp3')).resolves.toEqual({
      type: null,
      data: null
    });
  });

  it('reuses a persistent still for a sibling video', async () => {
    const file = '/music/still-video.mp3';
    const video = '/music/still-video.mp4';
    state.findSiblingVideo.mockReturnValue(video);
    state.readCoverMap.mockResolvedValue({
      [`still:${file}`]: { cacheFile: 'still.jpg', mtime: 200 }
    });
    state.files.set(join(PERSISTENT, 'still.jpg'), Buffer.from('still'));

    await expect(extractAndCacheStill(file)).resolves.toEqual({
      type: 'image',
      data: dataUrl(Buffer.from('still'))
    });
    expect(state.runCommand).not.toHaveBeenCalled();
  });

  it('extracts and persists a still frame for a sibling video', async () => {
    const file = '/music/still-new.mp3';
    const video = '/music/still-new.mp4';
    state.findSiblingVideo.mockReturnValue(video);
    state.runCommand.mockImplementation(async (_bin?: string, args?: string[]) => {
      const out = args?.at(-2);
      if (out) state.files.set(out, Buffer.from('fresh-still'));
      return '';
    });

    await expect(extractAndCacheStill(file)).resolves.toEqual({
      type: 'image',
      data: dataUrl(Buffer.from('fresh-still'))
    });
    await vi.waitFor(() => expect(state.writeFile).toHaveBeenCalled());
  });

  it('returns null when the still extraction fails', async () => {
    const file = '/music/still-fail.mp3';
    state.findSiblingVideo.mockReturnValue('/music/still-fail.mp4');
    state.runCommand.mockRejectedValue(new Error('no frame'));

    await expect(extractAndCacheStill(file)).resolves.toEqual({ type: null, data: null });
  });
});
