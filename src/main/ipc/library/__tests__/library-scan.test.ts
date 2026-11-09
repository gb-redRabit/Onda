import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import type { Stats } from 'fs';

const state = vi.hoisted(() => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  parseFile: vi.fn(),
  getDuration: vi.fn(),
  loggerWarn: vi.fn(),
  markCovers: vi.fn(),
  filterCovers: vi.fn((files: any[]) => files)
}));

vi.mock('fs/promises', () => ({ readdir: state.readdir, stat: state.stat }));
vi.mock('../../../utils/lazy-music-metadata', () => ({
  loadMusicMetadata: vi.fn(async () => ({ parseFile: state.parseFile }))
}));
vi.mock('../../media/media-handlers', () => ({ getDuration: state.getDuration }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../library-scan-filters', () => ({
  classifyFolderType: vi.fn(),
  filterFilesForFolderType: vi.fn(),
  filterCoverSiblingVideos: state.filterCovers,
  markSiblingVideoCovers: state.markCovers,
  FOLDER_TYPE_RATIO: 0.5
}));

import { createScanBudget, scanDir, scanFilePaths as scanFiles } from '../library-scan';

function stats(size = 10, mtimeMs = 5, birthtimeMs = 1): Stats {
  return { size, mtimeMs, birthtimeMs } as Stats;
}

function meta(overrides: Record<string, unknown> = {}) {
  return {
    common: {
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      year: 2020,
      genre: ['Rock'],
      track: { no: 3, of: 12 },
      picture: [{}],
      replaygain_track_gain: { dB: 0 },
      replaygain_album_gain: { dB: 20 }
    },
    format: {
      duration: 120,
      bitrate: 320000,
      sampleRate: 44100,
      numberOfChannels: 2,
      container: 'MP3',
      codec: 'mp3'
    },
    ...overrides
  };
}

function entry(name: string, kind: 'file' | 'dir' = 'file') {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file'
  };
}

function previous(overrides: Record<string, unknown> = {}) {
  return {
    id: 'D:/music/a.mp3',
    name: 'a.mp3',
    path: 'D:/music/a.mp3',
    extension: '.mp3',
    mimeType: '',
    size: 10,
    type: 'audio',
    addedAt: 1,
    playCount: 0,
    mtime: 5,
    hasCover: true,
    metadata: { title: 'Old', replayGainScanned: true },
    ...overrides
  } as never;
}

beforeEach(() => {
  state.readdir.mockReset();
  state.stat.mockReset();
  state.stat.mockResolvedValue(stats());
  state.parseFile.mockReset();
  state.parseFile.mockResolvedValue(meta());
  state.getDuration.mockReset();
  state.getDuration.mockResolvedValue(90);
  state.loggerWarn.mockReset();
  state.markCovers.mockReset();
  state.filterCovers.mockReset();
  state.filterCovers.mockImplementation((files) => files);
});

describe('scanFilePaths', () => {
  it('processes audio files with metadata', async () => {
    const files = await scanFiles(['D:/music/a.mp3']);

    expect(state.parseFile).toHaveBeenCalledWith('D:/music/a.mp3', {
      duration: true,
      skipCovers: false
    });
    expect(files[0]).toMatchObject({
      id: 'D:/music/a.mp3',
      name: 'a.mp3',
      extension: '.mp3',
      type: 'audio',
      duration: 120,
      hasCover: true,
      addedAt: 1,
      playCount: 0,
      mtime: 5
    });
    expect(files[0].metadata).toMatchObject({
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      year: 2020,
      genre: 'Rock',
      track: { no: 3, of: 12 },
      bitrate: 320000,
      sampleRate: 44100,
      format: 'MP3',
      codec: 'mp3',
      replayGainScanned: true,
      replayGainTrackGain: 1,
      replayGainAlbumGain: 10
    });
  });

  it('falls back for missing metadata fields', async () => {
    state.parseFile.mockResolvedValueOnce({
      common: { track: { no: null } },
      format: undefined
    });
    state.stat.mockResolvedValueOnce({ size: 3 } as Stats);

    const files = await scanFiles(['D:/music/name.flac']);

    expect(files[0]).toMatchObject({
      mimeType: '',
      duration: 0,
      hasCover: false,
      addedAt: expect.any(Number)
    });
    expect(files[0].metadata).toMatchObject({
      title: 'name',
      artist: '',
      album: '',
      track: undefined,
      bitrate: undefined,
      sampleRate: undefined,
      format: 'flac'
    });
  });

  it('skips cover parsing on fast scans', async () => {
    await scanFiles(['D:/music/a.mp3'], undefined, true);

    expect(state.parseFile).toHaveBeenCalledWith('D:/music/a.mp3', {
      duration: true,
      skipCovers: true
    });
  });

  it('reuses unchanged entries', async () => {
    const cached = previous();
    const files = await scanFiles(['D:/music/a.mp3'], new Map([['D:/music/a.mp3', cached]]));

    expect(files[0]).toBe(cached);
    expect(state.parseFile).not.toHaveBeenCalled();
  });

  it('re-scans entries without a cover flag unless fast-scanned', async () => {
    const cached = previous({ hasCover: undefined });
    const files = await scanFiles(['D:/music/a.mp3'], new Map([['D:/music/a.mp3', cached]]));

    expect(files[0]).not.toBe(cached);
    expect(state.parseFile).toHaveBeenCalled();
  });

  it('reuses without a cover flag on fast scans', async () => {
    const cached = previous({ hasCover: undefined });
    const files = await scanFiles(['D:/music/a.mp3'], new Map([['D:/music/a.mp3', cached]]), true);

    expect(files[0]).toBe(cached);
  });

  it('re-scans entries missing replay gain', async () => {
    const cached = previous({ metadata: { title: 'Old' } });
    const files = await scanFiles(['D:/music/a.mp3'], new Map([['D:/music/a.mp3', cached]]));

    expect(files[0]).not.toBe(cached);
  });

  it('handles metadata failures', async () => {
    state.parseFile.mockRejectedValueOnce(new Error('corrupt'));

    const files = await scanFiles(['D:/music/bad.mp3']);

    expect(files[0].metadata).toBeUndefined();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'library',
      expect.stringContaining('getAudioMetadata failed'),
      expect.any(Error)
    );
  });

  it('skips files that cannot be stat-ed', async () => {
    state.stat.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(scanFiles(['D:/music/missing.mp3'])).resolves.toEqual([]);
  });

  it('processes video files with durations', async () => {
    const files = await scanFiles(['D:/video/clip.mkv']);

    expect(state.getDuration).toHaveBeenCalledWith('D:/video/clip.mkv');
    expect(files[0]).toMatchObject({
      type: 'video',
      duration: 90,
      extension: '.mkv',
      mimeType: ''
    });
    expect(files[0].metadata).toBeUndefined();
  });

  it('reuses unchanged video files', async () => {
    const cached = previous({ path: 'D:/video/clip.mkv', type: 'video' });
    const files = await scanFiles(['D:/video/clip.mkv'], new Map([['D:/video/clip.mkv', cached]]));

    expect(files[0]).toBe(cached);
    expect(state.getDuration).not.toHaveBeenCalled();
  });

  it('processes images with their MIME type', async () => {
    const files = await scanFiles(['D:/pics/a.png']);

    expect(files[0]).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
      size: 10
    });
  });

  it('reuses unchanged images and ignores unknown extensions', async () => {
    const cached = previous({ path: 'D:/pics/a.png', type: 'image' });
    const files = await scanFiles(
      ['D:/pics/a.png', 'D:/notes.txt'],
      new Map([['D:/pics/a.png', cached]])
    );

    expect(files).toEqual([cached]);
  });

  it('handles missing files for media kinds', async () => {
    state.stat.mockRejectedValue(new Error('ENOENT'));
    await expect(scanFiles(['D:/video/clip.mp4', 'D:/pics/a.png'])).resolves.toEqual([]);
  });
});

describe('scanDir', () => {
  it('stops for aborted signals and depth limits', async () => {
    const aborted = { aborted: true } as AbortSignal;
    await expect(scanDir('D:/music', 10, 0, aborted)).resolves.toEqual({
      files: [],
      audioCount: 0,
      videoCount: 0,
      imageCount: 0
    });

    await expect(scanDir('D:/music', 1, 2)).resolves.toEqual({
      files: [],
      audioCount: 0,
      videoCount: 0,
      imageCount: 0
    });
  });

  it('marks the budget truncated when exhausted', async () => {
    const budget = createScanBudget(0);

    const res = await scanDir('D:/music', 10, 0, undefined, undefined, budget);

    expect(res.files).toEqual([]);
    expect(budget.truncated).toBe(true);
    expect(state.readdir).not.toHaveBeenCalled();
  });

  it('walks directories, media types and subfolders', async () => {
    state.readdir.mockImplementation(async (dir: string) => {
      if (dir === 'D:/music') {
        return [
          entry('a.mp3'),
          entry('clip.mp4'),
          entry('cover.png'),
          entry('notes.txt'),
          entry('sub', 'dir')
        ];
      }
      return [entry('b.flac')];
    });

    const res = await scanDir('D:/music');

    expect(res.audioCount).toBe(2);
    expect(res.videoCount).toBe(1);
    expect(res.imageCount).toBe(1);
    expect(res.files.map((file) => file.name).sort()).toEqual([
      'a.mp3',
      'b.flac',
      'clip.mp4',
      'cover.png'
    ]);
    expect(state.markCovers).toHaveBeenCalledTimes(2);
    expect(state.filterCovers).toHaveBeenCalledTimes(2);
  });

  it('decrements the budget and stops queueing when it runs out', async () => {
    state.readdir.mockResolvedValue([entry('a.mp3'), entry('b.mp3'), entry('c.mp3')]);
    const budget = createScanBudget(2);

    const res = await scanDir('D:/music', 10, 0, undefined, undefined, budget);

    expect(budget.truncated).toBe(true);
    expect(res.audioCount).toBe(2);
    expect(res.files).toHaveLength(0);
  });

  it('processes mixed chunks over several batches', async () => {
    const entries = [
      ...Array.from({ length: 20 }, (_, i) => entry(`a${i}.mp3`)),
      ...Array.from({ length: 20 }, (_, i) => entry(`v${i}.mp4`)),
      ...Array.from({ length: 20 }, (_, i) => entry(`i${i}.png`))
    ];
    state.readdir.mockResolvedValue(entries);

    const res = await scanDir('D:/mixed');

    expect(res.audioCount).toBe(20);
    expect(res.videoCount).toBe(20);
    expect(res.imageCount).toBe(20);
    expect(res.files).toHaveLength(60);
  });

  it('returns empty when a directory cannot be read', async () => {
    state.readdir.mockRejectedValue(new Error('EACCES'));

    const res = await scanDir('D:/private');

    expect(res).toEqual({ files: [], audioCount: 0, videoCount: 0, imageCount: 0 });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'library',
      expect.stringContaining('scanDir error reading D:/private')
    );
  });

  it('drops filtered cover videos from the result', async () => {
    state.readdir.mockResolvedValue([entry('a.mp3'), entry('clip.mp4')]);
    state.filterCovers.mockImplementation((files) =>
      files.filter((file: any) => file.type !== 'video')
    );

    const res = await scanDir('D:/music');

    expect(res.files.map((file) => file.name)).toEqual(['a.mp3']);
    expect(res.videoCount).toBe(1);
  });

  it('reuses previous metadata during scans', async () => {
    state.readdir.mockResolvedValue([entry('a.mp3')]);
    const cached = previous();
    const files = await scanDir(
      'D:/music',
      10,
      0,
      undefined,
      new Map([[join('D:/music', 'a.mp3'), cached]])
    );

    expect(files.files[0]).toBe(cached);
    expect(state.parseFile).not.toHaveBeenCalled();
  });
});

describe('budget', () => {
  it('starts with the requested limit', () => {
    expect(createScanBudget(5)).toEqual({ remaining: 5, truncated: false });
  });
});
