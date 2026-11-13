import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  statSync: vi.fn()
}));

vi.mock('fs', () => ({ statSync: h.statSync }));

import { extractMediaPaths, isMediaFilePath, isServableMediaPath } from '../media-paths';

beforeEach(() => {
  h.statSync.mockReset().mockReturnValue({ isFile: () => true });
});

describe('isServableMediaPath', () => {
  it('accepts audio, video and image extensions case-insensitively', () => {
    expect(isServableMediaPath('D:/a.mp3')).toBe(true);
    expect(isServableMediaPath('D:/a.MP4')).toBe(true);
    expect(isServableMediaPath('D:/a.png')).toBe(true);
  });

  it('rejects empty and non-media paths', () => {
    expect(isServableMediaPath('')).toBe(false);
    expect(isServableMediaPath('D:/secrets.json')).toBe(false);
    expect(isServableMediaPath('D:/noext')).toBe(false);
  });
});

describe('isMediaFilePath', () => {
  it('requires an existing media file', () => {
    expect(isMediaFilePath('D:/a.mp3')).toBe(true);
    expect(h.statSync).toHaveBeenCalledWith('D:/a.mp3');
  });

  it('rejects CLI flags, empty paths and non-media extensions', () => {
    expect(isMediaFilePath('-v')).toBe(false);
    expect(isMediaFilePath('')).toBe(false);
    expect(isMediaFilePath('D:/a.txt')).toBe(false);
    expect(h.statSync).not.toHaveBeenCalled();
  });

  it('rejects missing files and directories', () => {
    h.statSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect(isMediaFilePath('D:/gone.mp3')).toBe(false);

    h.statSync.mockReturnValue({ isFile: () => false });
    expect(isMediaFilePath('D:/folder.mp3')).toBe(false);
  });
});

describe('extractMediaPaths', () => {
  it('normalizes and de-duplicates media files', () => {
    const paths = extractMediaPaths(['D:/Music/a.mp3', 'D:/Music/../Music/a.mp3', '--flag']);

    expect(paths).toHaveLength(1);
    expect(paths[0].toLowerCase()).toContain('music');
  });

  it('keeps order and skips invalid entries', () => {
    h.statSync.mockImplementation((p: string) => {
      if (p.includes('bad')) throw new Error('ENOENT');
      return { isFile: () => true };
    });

    const paths = extractMediaPaths(['D:/a.mp3', 'D:/bad.mp4', 'D:/b.mkv']);

    expect(paths.map((p) => p.replace(/\\/g, '/'))).toEqual(['D:/a.mp3', 'D:/b.mkv']);
  });

  it('returns an empty list for no arguments', () => {
    expect(extractMediaPaths([])).toEqual([]);
  });
});
