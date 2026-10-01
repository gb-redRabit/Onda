import { describe, it, expect, vi } from 'vitest';
import type { MediaFile } from '../../../shared/types/media';
import { classifyFolderType, filterFilesForFolderType, scanDir } from '../library-scan';

vi.mock('../media-handlers', () => ({
  getDuration: vi.fn(async () => 0)
}));

const { statMock, readdirMock } = vi.hoisted(() => ({
  statMock: vi.fn(async (..._args: unknown[]) => ({ size: 10, mtimeMs: 1, birthtimeMs: 1 })),
  readdirMock: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => [])
}));

vi.mock('fs/promises', () => {
  const mod = {
    stat: (...args: unknown[]) => statMock(...args),
    readdir: (...args: unknown[]) => readdirMock(...args)
  };
  return { ...mod, default: mod };
});

vi.mock('music-metadata', () => ({
  parseFile: vi.fn(async () => ({ common: {}, format: {} }))
}));

function mediaFile(type: MediaFile['type'], path: string): MediaFile {
  return {
    id: path,
    name: path,
    path,
    extension: 'mp3',
    mimeType: '',
    size: 1,
    type,
    addedAt: 0,
    playCount: 0
  };
}

describe('classifyFolderType', () => {
  it('classifies a folder with only images as image', () => {
    expect(classifyFolderType({ audioCount: 0, videoCount: 0, imageCount: 5 })).toBe('image');
  });

  it('classifies a folder with only audio as audio', () => {
    expect(classifyFolderType({ audioCount: 4, videoCount: 0, imageCount: 0 })).toBe('audio');
  });

  it('classifies a folder with only video as video', () => {
    expect(classifyFolderType({ audioCount: 0, videoCount: 3, imageCount: 0 })).toBe('video');
  });

  it('classifies a folder with 50% audio files as audio', () => {
    expect(classifyFolderType({ audioCount: 5, videoCount: 5, imageCount: 0 })).toBe('audio');
  });

  it('classifies a folder with majority audio as audio', () => {
    expect(classifyFolderType({ audioCount: 6, videoCount: 4, imageCount: 0 })).toBe('audio');
  });

  it('classifies a folder with majority video as video', () => {
    expect(classifyFolderType({ audioCount: 4, videoCount: 6, imageCount: 0 })).toBe('video');
  });

  it('classifies an even audio/video split with images as audio', () => {
    expect(classifyFolderType({ audioCount: 5, videoCount: 5, imageCount: 10 })).toBe('audio');
  });

  it('classifies an empty folder as mixed', () => {
    expect(classifyFolderType({ audioCount: 0, videoCount: 0, imageCount: 0 })).toBe('mixed');
  });

  it('classifies a tie at exactly 50/50 as audio (audio checked first)', () => {
    expect(classifyFolderType({ audioCount: 1, videoCount: 1, imageCount: 0 })).toBe('audio');
  });
});

describe('filterFilesForFolderType', () => {
  const files: MediaFile[] = [
    mediaFile('audio', '/a.mp3'),
    mediaFile('video', '/b.mp4'),
    mediaFile('image', '/c.jpg')
  ];

  it('keeps only audio files for an audio folder', () => {
    const filtered = filterFilesForFolderType(files, 'audio');
    expect(filtered.map((f) => f.type)).toEqual(['audio']);
  });

  it('keeps all files for a video folder', () => {
    expect(filterFilesForFolderType(files, 'video')).toHaveLength(3);
  });

  it('keeps all files for an image folder', () => {
    expect(filterFilesForFolderType(files, 'image')).toHaveLength(3);
  });

  it('keeps all files for a mixed folder', () => {
    expect(filterFilesForFolderType(files, 'mixed')).toHaveLength(3);
  });

  it('returns an empty array for an audio folder with no audio files', () => {
    const onlyVideo = [mediaFile('video', '/b.mp4'), mediaFile('image', '/c.jpg')];
    expect(filterFilesForFolderType(onlyVideo, 'audio')).toEqual([]);
  });
});

describe('scanDir stat efficiency', () => {
  it('stats each audio file only once per scan', async () => {
    readdirMock.mockResolvedValue([
      { name: 'song.mp3', isDirectory: () => false, isFile: () => true }
    ]);
    statMock.mockClear();

    await scanDir('/music');

    expect(statMock).toHaveBeenCalledTimes(1);
  });
});
