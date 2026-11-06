import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Handlery mediów: sprawdzamy bramki bezpieczeństwa i delegację do usług.
// System plików działa naprawdę (stat/rename/readFile), a metadata, ID3,
// binarki i usługi mediów są podstawione.
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  readable: new Set<string>(),
  protectedPaths: new Set<string>(),
  sensitive: new Set<string>(),
  temp: new Set<string>(),
  withinRoots: new Set<string>(),
  id3Update: vi.fn(async () => undefined),
  id3Read: vi.fn(async () => ({}) as unknown),
  parseFile: vi.fn(async () => ({ format: { duration: 0 } })),
  getCachedDuration: vi.fn((): { duration: number; mtimeMs: number } | undefined => undefined),
  setCachedDuration: vi.fn(),
  deleteCachedDuration: vi.fn(),
  invalidateCachedCover: vi.fn(),
  clearCoverCache: vi.fn(async () => ({ removed: 2, bytesFreed: 1024 })),
  readCoverMap: vi.fn(
    async (): Promise<Record<string, { cacheFile: string; mtime: number }>> => ({})
  ),
  writeCoverMap: vi.fn(async () => undefined),
  safeUnlink: vi.fn(async () => undefined),
  runCommand: vi.fn(async (_bin?: string, _args?: string[], _opts?: unknown) => ''),
  resolveBin: vi.fn(async () => '/usr/bin/ffprobe'),
  getThumbnail: vi.fn(async () => 'thumb'),
  batchThumbnails: vi.fn(async () => ({})),
  getWaveform: vi.fn(async () => [1, 2, 3]),
  transcodeAudioChunk: vi.fn(async () => 'chunk.mp3'),
  transcodeAudio: vi.fn(async () => 'audio.m4a'),
  transcodeVideo: vi.fn(async () => 'video.mp4'),
  cleanupOldTranscodes: vi.fn(),
  isPathWithinAllowedRoots: vi.fn((path: string) => mocks.withinRoots.has(path)),
  addAllowedRoot: vi.fn(async (_path: string) => true),
  coverEmbedSupported: vi.fn(() => true),
  embedCover: vi.fn(async () => undefined),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler);
    }
  }
}));
vi.mock('node-id3', () => ({
  default: { Promise: { update: mocks.id3Update, read: mocks.id3Read } }
}));
vi.mock('../../utils/lazy-music-metadata', () => ({
  loadMusicMetadata: async () => ({ parseFile: mocks.parseFile })
}));
vi.mock('../cover/cover-cache', () => ({
  getCachedDuration: mocks.getCachedDuration,
  setCachedDuration: mocks.setCachedDuration,
  deleteCachedDuration: mocks.deleteCachedDuration,
  invalidateCachedCover: mocks.invalidateCachedCover,
  PERSISTENT_COVER_DIR: '/persistent-covers',
  clearCoverCache: mocks.clearCoverCache
}));
vi.mock('../cover/cover-map', () => ({
  readCoverMap: mocks.readCoverMap,
  writeCoverMap: mocks.writeCoverMap
}));
vi.mock('../../utils/fs-atomic', () => ({ safeUnlink: mocks.safeUnlink }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: mocks.loggerWarn, info: mocks.loggerInfo, error: vi.fn() }
}));
vi.mock('../../utils/exec', () => ({ runCommand: mocks.runCommand }));
vi.mock('../../media/read-access', () => ({
  isReadableMediaPath: (path: string) => mocks.readable.has(path)
}));
vi.mock('../../binaries', () => ({ resolveBin: mocks.resolveBin }));
vi.mock('../media/media-thumbnails', () => ({
  getThumbnail: mocks.getThumbnail,
  batchThumbnails: mocks.batchThumbnails
}));
vi.mock('../media/waveform', () => ({ getWaveform: mocks.getWaveform }));
vi.mock('../media/media-transcode', () => ({
  transcodeAudioChunk: mocks.transcodeAudioChunk,
  transcodeAudio: mocks.transcodeAudio,
  transcodeVideo: mocks.transcodeVideo,
  cleanupOldTranscodes: mocks.cleanupOldTranscodes
}));
vi.mock('../../path-policy', () => ({
  isProtectedPath: (path: string) => mocks.protectedPaths.has(path),
  isSensitivePath: (path: string) => mocks.sensitive.has(path),
  isSystemTempPath: (path: string) => mocks.temp.has(path)
}));
vi.mock('../../media/media-server', () => ({
  isPathWithinAllowedRoots: mocks.isPathWithinAllowedRoots,
  addAllowedRoot: mocks.addAllowedRoot
}));
vi.mock('../../media/cover-embed', () => ({
  coverEmbedSupported: mocks.coverEmbedSupported,
  embedCover: mocks.embedCover
}));

const { registerMediaHandlers, getDuration, writeCoverToAudioFile } =
  await import('../media/media-handlers');
registerMediaHandlers();

const root = mkdtempSync(join(tmpdir(), 'onda-media-handlers-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function handler(channel: string): (...args: any[]) => any {
  const found = mocks.handlers.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

function tempFile(name: string, content = 'x'): string {
  const path = join(root, name);
  writeFileSync(path, content);
  return path;
}

beforeEach(() => {
  mocks.readable.clear();
  mocks.protectedPaths.clear();
  mocks.sensitive.clear();
  mocks.temp.clear();
  mocks.withinRoots.clear();
  mocks.id3Update.mockClear();
  mocks.id3Read.mockReset();
  mocks.id3Read.mockResolvedValue({});
  mocks.parseFile.mockReset();
  mocks.parseFile.mockResolvedValue({ format: { duration: 0 } });
  mocks.getCachedDuration.mockReset();
  mocks.setCachedDuration.mockClear();
  mocks.deleteCachedDuration.mockClear();
  mocks.invalidateCachedCover.mockClear();
  mocks.clearCoverCache.mockReset();
  mocks.clearCoverCache.mockResolvedValue({ removed: 2, bytesFreed: 1024 });
  mocks.readCoverMap.mockReset();
  mocks.readCoverMap.mockResolvedValue({});
  mocks.writeCoverMap.mockClear();
  mocks.safeUnlink.mockClear();
  mocks.runCommand.mockReset();
  mocks.runCommand.mockResolvedValue('');
  mocks.resolveBin.mockResolvedValue('/usr/bin/ffprobe');
  mocks.getThumbnail.mockClear();
  mocks.batchThumbnails.mockReset();
  mocks.batchThumbnails.mockResolvedValue({});
  mocks.getWaveform.mockReset();
  mocks.getWaveform.mockResolvedValue([1, 2, 3]);
  mocks.transcodeAudioChunk.mockClear();
  mocks.transcodeAudio.mockClear();
  mocks.transcodeVideo.mockClear();
  mocks.cleanupOldTranscodes.mockClear();
  mocks.addAllowedRoot.mockReset();
  mocks.addAllowedRoot.mockResolvedValue(true);
  mocks.coverEmbedSupported.mockReset();
  mocks.coverEmbedSupported.mockReturnValue(true);
  mocks.embedCover.mockClear();
});

describe('registration', () => {
  it('registers the media, duration and cover cache channels', () => {
    expect([...mocks.handlers.keys()]).toEqual(
      expect.arrayContaining([
        'media:getThumbnail',
        'media:writeTags',
        'media:readCover',
        'media:grantAccess',
        'media:getDuration',
        'media:getWaveform',
        'media:batchDurations',
        'coverCache:clear'
      ])
    );
  });
});

describe('media:getThumbnail', () => {
  it('rejects unsafe and unresolved paths', async () => {
    expect(await handler('media:getThumbnail')({}, 'relative/path.jpg')).toBeNull();
    expect(await handler('media:getThumbnail')({}, join(root, 'missing.jpg'))).toBeNull();
    expect(mocks.getThumbnail).not.toHaveBeenCalled();
  });

  it('allows only paths inside media roots', async () => {
    const file = tempFile('thumb.jpg');
    mocks.withinRoots.add(file);
    expect(await handler('media:getThumbnail')({}, file, 128)).toBe('thumb');
    expect(mocks.getThumbnail).toHaveBeenCalledWith(file, 128);
  });
});

describe('media:batchThumbnails', () => {
  it('rejects a non-array payload', async () => {
    expect(await handler('media:batchThumbnails')({}, 'nope')).toEqual({});
    expect(mocks.batchThumbnails).not.toHaveBeenCalled();
  });

  it('filters files outside allowed roots before batching', async () => {
    const allowed = tempFile('a.jpg');
    const blocked = tempFile('b.jpg');
    mocks.withinRoots.add(allowed);

    await handler('media:batchThumbnails')({}, [allowed, blocked], 64);

    expect(mocks.batchThumbnails).toHaveBeenCalledWith([allowed], 64);
  });
});

describe('media:writeTags', () => {
  it('rejects unsafe and protected paths', async () => {
    expect(await handler('media:writeTags')({}, 'relative.mp3', {})).toEqual({
      success: false,
      error: 'Invalid path'
    });
    const file = tempFile('protected.mp3');
    mocks.protectedPaths.add(file);
    expect(await handler('media:writeTags')({}, file, {})).toEqual({
      success: false,
      error: 'Protected path'
    });
    expect(mocks.id3Update).not.toHaveBeenCalled();
  });

  it('drops undefined values and writes the rest', async () => {
    const file = tempFile('tags.mp3');
    const result = await handler('media:writeTags')({}, file, {
      title: 'Song',
      artist: undefined
    });
    expect(result).toEqual({ success: true });
    expect(mocks.id3Update).toHaveBeenCalledWith({ title: 'Song' }, file);
  });

  it('reports library errors', async () => {
    const file = tempFile('tags2.mp3');
    mocks.id3Update.mockRejectedValueOnce(new Error('bad tag'));
    expect(await handler('media:writeTags')({}, file, { title: 'x' })).toEqual({
      success: false,
      error: 'bad tag'
    });
  });
});

describe('media:renameFile', () => {
  it('rejects invalid and protected sources', async () => {
    expect(await handler('media:renameFile')({}, 'x.mp3', 'y.mp3')).toEqual({
      success: false,
      error: 'Invalid path'
    });
    const file = tempFile('protected-rename.mp3');
    mocks.protectedPaths.add(file);
    expect(await handler('media:renameFile')({}, file, 'y.mp3')).toEqual({
      success: false,
      error: 'Protected path'
    });
  });

  it('sanitizes forbidden characters and keeps the extension', async () => {
    const file = tempFile('rename.mp3', 'audio');
    const result = await handler('media:renameFile')({}, file, 'new:name?');

    expect(result.success).toBe(true);
    expect(result.newPath).toBe(join(root, 'new_name_.mp3'));
  });

  it('appends the original extension when missing', async () => {
    const file = tempFile('rename2.mp3', 'audio');
    const result = await handler('media:renameFile')({}, file, 'plain');
    expect(result.newPath).toBe(join(root, 'plain.mp3'));
  });

  it('rejects an empty sanitized name', async () => {
    const file = tempFile('rename3.mp3');
    expect(await handler('media:renameFile')({}, file, '   ')).toEqual({
      success: false,
      error: 'Nazwa nie może być pusta'
    });
  });

  it('reports a filesystem error', async () => {
    const result = await handler('media:renameFile')({}, join(root, 'does-not-exist.mp3'), 'x');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('media:writeCover', () => {
  it('rejects invalid, protected and unsafe image sources', async () => {
    expect(await handler('media:writeCover')({}, 'relative.mp3', [1])).toEqual({
      success: false,
      error: 'Invalid path'
    });
    const file = tempFile('cover.mp3');
    mocks.protectedPaths.add(file);
    expect(await handler('media:writeCover')({}, file, [1])).toEqual({
      success: false,
      error: 'Protected path'
    });
    mocks.protectedPaths.clear();
    expect(await handler('media:writeCover')({}, file, 'relative/cover.jpg')).toEqual({
      success: false,
      error: 'Invalid image path'
    });
  });

  it('embeds an in-memory image and drops the persistent entry', async () => {
    const file = tempFile('cover2.mp3');
    mocks.readCoverMap.mockResolvedValue({ [file]: { cacheFile: 'old.jpg', mtime: 1 } });

    expect(await handler('media:writeCover')({}, file, [1, 2, 3])).toEqual({ success: true });

    expect(mocks.embedCover).toHaveBeenCalledWith(file, {
      buffer: Buffer.from([1, 2, 3]),
      mime: 'image/jpeg'
    });
    expect(mocks.invalidateCachedCover).toHaveBeenCalledWith(file);
    expect(mocks.safeUnlink).toHaveBeenCalledWith(expect.stringContaining('old.jpg'));
    expect(mocks.writeCoverMap).toHaveBeenCalledWith({});
  });

  it('infers the mime type from an image file path', async () => {
    const file = tempFile('cover3.mp3');
    const image = tempFile('cover.png', 'png-bytes');

    expect(await writeCoverToAudioFile(file, image)).toEqual({ success: true });

    expect(mocks.embedCover).toHaveBeenCalledWith(file, {
      buffer: Buffer.from('png-bytes'),
      mime: 'image/png'
    });
  });

  it('refuses formats that cannot embed a cover', async () => {
    const file = tempFile('cover4.m4a');
    mocks.coverEmbedSupported.mockReturnValue(false);

    const result = await writeCoverToAudioFile(file, [1]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('unsupported for .m4a');
    expect(mocks.embedCover).not.toHaveBeenCalled();
  });
});

describe('media:readCover', () => {
  it('rejects unsafe and unreadable files', async () => {
    expect(await handler('media:readCover')({}, 'relative.mp3')).toBeNull();
    expect(await handler('media:readCover')({}, join(root, 'unreadable.mp3'))).toBeNull();
    expect(mocks.id3Read).not.toHaveBeenCalled();
  });

  it('returns an embedded buffer and mime', async () => {
    const file = tempFile('read.mp3');
    mocks.readable.add(file);
    mocks.id3Read.mockResolvedValue({
      image: { imageBuffer: Buffer.from([9, 8]), mime: 'image/png' }
    });

    expect(await handler('media:readCover')({}, file)).toEqual({
      mime: 'image/png',
      data: [9, 8]
    });
  });

  it('ignores a string image tag (path traversal vector)', async () => {
    const file = tempFile('read2.mp3');
    mocks.readable.add(file);
    mocks.id3Read.mockResolvedValue({ image: '/etc/passwd' });

    expect(await handler('media:readCover')({}, file)).toBeNull();
  });

  it('returns null and logs when reading fails', async () => {
    const file = tempFile('read3.mp3');
    mocks.readable.add(file);
    mocks.id3Read.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    expect(await handler('media:readCover')({}, file)).toBeNull();
    expect(mocks.loggerInfo).toHaveBeenCalled();
  });
});

describe('media:checkAudioCodec', () => {
  it('rejects unsafe and unreadable files', async () => {
    expect(await handler('media:checkAudioCodec')({}, 'relative.mp3')).toBeNull();
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });

  it('normalizes the codec and flags supported ones', async () => {
    const file = tempFile('codec.mp3');
    mocks.readable.add(file);
    mocks.runCommand.mockResolvedValue(' AAC \n');

    expect(await handler('media:checkAudioCodec')({}, file)).toEqual({
      codec: 'aac',
      supported: true
    });
  });

  it('marks ALAC as unsupported so it goes through transcoding', async () => {
    const file = tempFile('codec2.m4a');
    mocks.readable.add(file);
    mocks.runCommand.mockResolvedValue('alac');

    expect(await handler('media:checkAudioCodec')({}, file)).toEqual({
      codec: 'alac',
      supported: false
    });
  });

  it('returns null when ffprobe fails', async () => {
    const file = tempFile('codec3.mp3');
    mocks.readable.add(file);
    mocks.runCommand.mockRejectedValue(new Error('no ffprobe'));

    expect(await handler('media:checkAudioCodec')({}, file)).toBeNull();
  });
});

describe('transcoding handlers', () => {
  it('rejects unreadable paths', async () => {
    expect(await handler('media:transcodeAudio')({}, 'relative.mp3')).toBeNull();
    expect(mocks.transcodeAudio).not.toHaveBeenCalled();
  });

  it('delegates chunk, full audio and video with guard checks', async () => {
    const file = tempFile('audio.mp3');
    mocks.readable.add(file);

    expect(await handler('media:transcodeAudioChunk')({}, file, 1, 2)).toBe('chunk.mp3');
    expect(await handler('media:transcodeAudio')({}, file)).toBe('audio.m4a');
    expect(await handler('media:transcodeVideo')({}, file)).toBe('video.mp4');

    expect(mocks.transcodeAudioChunk).toHaveBeenCalledWith(file, 1, 2);
    expect(mocks.transcodeAudio).toHaveBeenCalledWith(file);
    expect(mocks.transcodeVideo).toHaveBeenCalledWith(file);
  });
});

describe('media:grantAccess', () => {
  it('rejects unsafe, protected and sensitive paths', async () => {
    expect(await handler('media:grantAccess')({}, 'relative.mp4')).toBe(false);

    const protectedFile = tempFile('protected.mp4');
    mocks.protectedPaths.add(protectedFile);
    expect(await handler('media:grantAccess')({}, protectedFile)).toBe(false);

    const sensitive = tempFile('secret.mp4');
    mocks.sensitive.add(sensitive);
    expect(await handler('media:grantAccess')({}, sensitive)).toBe(false);
    expect(mocks.addAllowedRoot).not.toHaveBeenCalled();
  });

  it('accepts an already readable file without expanding roots', async () => {
    const file = tempFile('known.mp4');
    mocks.readable.add(file);
    expect(await handler('media:grantAccess')({}, file)).toBe(true);
    expect(mocks.addAllowedRoot).not.toHaveBeenCalled();
  });

  it('rejects a missing path', async () => {
    expect(await handler('media:grantAccess')({}, join(root, 'gone.mp4'))).toBe(false);
  });

  it('adds the directory for a directory path', async () => {
    const dir = join(root, 'folder');
    mkdirSync(dir);
    expect(await handler('media:grantAccess')({}, dir)).toBe(true);
    expect(mocks.addAllowedRoot).toHaveBeenCalledWith(dir);
  });

  it('adds the parent for a file and falls back to the file itself', async () => {
    const file = tempFile('single.mp4');
    mocks.addAllowedRoot.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    expect(await handler('media:grantAccess')({}, file)).toBe(true);
    expect(mocks.addAllowedRoot).toHaveBeenNthCalledWith(1, root);
    expect(mocks.addAllowedRoot).toHaveBeenNthCalledWith(2, file);
  });

  it('allows a protected path inside the system temp directory', async () => {
    const file = tempFile('temp-protected.mp4');
    mocks.protectedPaths.add(file);
    mocks.temp.add(file);

    expect(await handler('media:grantAccess')({}, file)).toBe(true);
    expect(mocks.addAllowedRoot).toHaveBeenCalledWith(root);
  });
});

describe('media:getDuration', () => {
  it('returns a cached duration when the mtime is unchanged', async () => {
    const file = tempFile('cached.mp3');
    mocks.getCachedDuration.mockReturnValue({ duration: 123, mtimeMs: Number.MAX_VALUE });

    expect(await getDuration(file)).toBe(123);
    expect(mocks.parseFile).not.toHaveBeenCalled();
  });

  it('refreshes the cache when the file changed', async () => {
    const file = tempFile('changed.mp3');
    mocks.getCachedDuration.mockReturnValue({ duration: 10, mtimeMs: 1 });
    mocks.parseFile.mockResolvedValue({ format: { duration: 42 } });

    expect(await getDuration(file)).toBe(42);
    expect(mocks.deleteCachedDuration).toHaveBeenCalledWith(file);
    expect(mocks.setCachedDuration).toHaveBeenCalledWith(file, {
      duration: 42,
      mtimeMs: expect.any(Number)
    });
  });

  it('falls back to ffprobe when metadata parsing fails', async () => {
    const file = tempFile('ffprobe.mp3');
    mocks.parseFile.mockRejectedValue(new Error('bad metadata'));
    mocks.runCommand.mockResolvedValue('12.5\n');

    expect(await getDuration(file)).toBe(12.5);
    expect(mocks.runCommand).toHaveBeenCalledWith(
      '/usr/bin/ffprobe',
      expect.arrayContaining(['-show_entries', 'format=duration', '--', file]),
      { timeout: 10000 }
    );
  });

  it('returns zero when metadata and ffprobe both fail', async () => {
    const file = tempFile('broken.mp3');
    mocks.parseFile.mockRejectedValue(new Error('bad metadata'));
    mocks.runCommand.mockRejectedValue(new Error('no ffprobe'));

    expect(await getDuration(file)).toBe(0);
  });

  it('guards the IPC wrapper', async () => {
    expect(await handler('media:getDuration')({}, 'relative.mp3')).toBe(0);

    const file = tempFile('ipc-duration.mp3');
    mocks.readable.add(file);
    mocks.getCachedDuration.mockReturnValue({ duration: 7, mtimeMs: Number.MAX_VALUE });
    expect(await handler('media:getDuration')({}, file)).toBe(7);
  });
});

describe('media:getWaveform', () => {
  it('rejects unsafe and unreadable files', async () => {
    expect(await handler('media:getWaveform')({}, 'relative.mp3')).toEqual([]);
    expect(mocks.getWaveform).not.toHaveBeenCalled();
  });

  it('normalizes a non-finite duration and delegates', async () => {
    const file = tempFile('wave.mp3');
    mocks.readable.add(file);

    expect(await handler('media:getWaveform')({}, file, Number.NaN)).toEqual([1, 2, 3]);
    expect(mocks.getWaveform).toHaveBeenCalledWith(file, 0);
  });

  it('returns an empty waveform on failure', async () => {
    const file = tempFile('wave2.mp3');
    mocks.readable.add(file);
    mocks.getWaveform.mockRejectedValue(new Error('decode'));

    expect(await handler('media:getWaveform')({}, file, 10)).toEqual([]);
  });
});

describe('media:batchDurations', () => {
  it('returns an empty map for a non-array payload', async () => {
    expect(await handler('media:batchDurations')({}, null)).toEqual({});
  });

  it('keeps only readable files and reports their durations', async () => {
    const first = tempFile('batch1.mp3');
    const second = tempFile('batch2.mp3');
    mocks.readable.add(first);
    mocks.parseFile.mockResolvedValue({ format: { duration: 3 } });

    const result = await handler('media:batchDurations')({}, ['relative.mp3', first, second]);

    expect(result).toEqual({ [first]: 3 });
  });

  it('stores zero for files that cannot be parsed', async () => {
    const file = tempFile('batch3.mp3');
    mocks.readable.add(file);
    mocks.parseFile.mockRejectedValue(new Error('bad'));
    mocks.runCommand.mockRejectedValue(new Error('bad'));

    expect(await handler('media:batchDurations')({}, [file])).toEqual({ [file]: 0 });
  });
});

describe('coverCache:clear', () => {
  it('reports removed entries and freed bytes', async () => {
    expect(await handler('coverCache:clear')({})).toEqual({
      success: true,
      removed: 2,
      bytesFreed: 1024
    });
  });

  it('reports an error when clearing fails', async () => {
    mocks.clearCoverCache.mockRejectedValue(new Error('locked'));
    expect(await handler('coverCache:clear')({})).toEqual({ success: false, error: 'locked' });
  });
});
