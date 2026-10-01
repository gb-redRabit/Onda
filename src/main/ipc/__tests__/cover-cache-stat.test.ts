import { describe, it, expect, vi } from 'vitest';

// A cold cover miss used to stat the file twice inside `extractAndCacheCover`:
// once to check existence and again to record the mtime for the cache entry.
// The second stat is redundant — the file is the one just validated.

const { statMock } = vi.hoisted(() => ({
  statMock: vi.fn(async (..._args: unknown[]) => ({ mtimeMs: 123, size: 1 }))
}));

vi.mock('fs/promises', () => {
  const mod = {
    stat: (...args: unknown[]) => statMock(...args),
    readFile: vi.fn(async () => Buffer.from('')),
    writeFile: vi.fn(async () => {}),
    mkdir: vi.fn(async () => {}),
    unlink: vi.fn(async () => {})
  };
  return { ...mod, default: mod };
});

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] }
}));

vi.mock('../cover/cover-map', () => ({
  readCoverMap: vi.fn(async () => ({})),
  writeCoverMap: vi.fn(async () => {})
}));

vi.mock('../cover/cover-cache-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cover/cover-cache-helpers')>();
  return { ...actual, findSiblingVideo: () => null };
});

vi.mock('sharp', () => ({ default: vi.fn() }));
vi.mock('music-metadata', () => ({ parseFile: vi.fn(async () => ({ common: {}, format: {} })) }));
vi.mock('../../binaries', () => ({ resolveBin: vi.fn(async () => null) }));
vi.mock('../../utils/exec', () => ({ runCommand: vi.fn(async () => '') }));
vi.mock('../../utils/clear-dir', () => ({
  clearDirContents: vi.fn(async () => ({ removed: 0, bytesFreed: 0 }))
}));

import {
  extractAndCacheCover,
  getCachedDuration,
  setCachedDuration,
  deleteCachedDuration
} from '../cover/cover-cache';

describe('extractAndCacheCover stat usage', () => {
  it('stats a cold cover miss only once', async () => {
    statMock.mockClear();
    // A non-audio, non-video extension takes the "no cover" branch without
    // invoking ffmpeg/sharp, so only the stat calls are exercised.
    const result = await extractAndCacheCover('/music/picture.jpg');
    expect(result).toEqual({ type: null, data: null });
    expect(statMock).toHaveBeenCalledTimes(1);
  });

  it('round-trips the duration cache through its accessors', () => {
    setCachedDuration('/a.mp3', { duration: 5, mtimeMs: 1 });
    expect(getCachedDuration('/a.mp3')).toEqual({ duration: 5, mtimeMs: 1 });
    deleteCachedDuration('/a.mp3');
    expect(getCachedDuration('/a.mp3')).toBeUndefined();
  });
});
