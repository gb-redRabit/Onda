import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('fs/promises', () => ({ readdir: state.readdir, stat: state.stat }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

import { getFileProperties } from '../fs-properties';

function stats(overrides: Record<string, unknown> = {}) {
  return {
    isDirectory: () => false,
    size: 10,
    birthtimeMs: 1,
    mtimeMs: 2,
    ...overrides
  };
}

function entry(name: string, kind: 'file' | 'dir') {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file'
  };
}

beforeEach(() => {
  state.readdir.mockReset();
  state.stat.mockReset();
  state.stat.mockResolvedValue(stats());
  state.loggerWarn.mockReset();
});

describe('files', () => {
  it('returns base properties', async () => {
    await expect(getFileProperties('D:/music/song.mp3')).resolves.toEqual({
      name: 'song.mp3',
      path: 'D:/music/song.mp3',
      isDirectory: false,
      size: 10,
      createdAt: 1,
      modifiedAt: 2
    });
    expect(state.readdir).not.toHaveBeenCalled();
  });

  it('returns null when stat fails', async () => {
    state.stat.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(getFileProperties('D:/missing')).resolves.toBeNull();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'getProperties stat failed for D:/missing',
      expect.any(Error)
    );
  });
});

describe('directories', () => {
  beforeEach(() => {
    state.stat.mockResolvedValue(stats({ isDirectory: () => true, size: 0 }));
  });

  it('walks the tree and aggregates counts and sizes', async () => {
    state.readdir.mockImplementation(async (dir: string) => {
      if (dir === 'D:/music') {
        return [entry('a.mp3', 'file'), entry('sub', 'dir'), entry('skip', 'link' as never)];
      }
      return [entry('b.mp3', 'file')];
    });
    state.stat.mockImplementation(async (path: string) => {
      if (path === 'D:/music') return stats({ isDirectory: () => true, size: 0 });
      if (path === join('D:/music', 'a.mp3')) return stats({ size: 5 });
      if (path === join('D:/music', 'sub', 'b.mp3')) return stats({ size: 7 });
      return stats({ isDirectory: () => true, size: 0 });
    });

    await expect(getFileProperties('D:/music')).resolves.toEqual({
      name: 'music',
      path: 'D:/music',
      isDirectory: true,
      size: 0,
      createdAt: 1,
      modifiedAt: 2,
      itemCount: 3,
      dirCount: 1,
      fileCount: 2,
      totalSize: 12,
      truncated: false
    });
    expect(state.readdir).toHaveBeenCalledWith('D:/music', { withFileTypes: true });
    expect(state.readdir).toHaveBeenCalledWith(join('D:/music', 'sub'), {
      withFileTypes: true
    });
  });

  it('logs unreadable directories and continues', async () => {
    state.readdir.mockImplementation(async (dir: string) => {
      if (dir === 'D:/music') return [entry('a.mp3', 'file'), entry('sub', 'dir')];
      throw new Error('EACCES');
    });

    const result = await getFileProperties('D:/music');

    expect(result).toMatchObject({ fileCount: 1, dirCount: 1 });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      expect.stringContaining('getProperties walk failed for'),
      expect.any(Error)
    );
  });

  it('logs file stat failures and keeps the total', async () => {
    state.readdir.mockResolvedValueOnce([entry('a.mp3', 'file'), entry('b.mp3', 'file')]);
    state.stat
      .mockImplementationOnce(async () => stats({ isDirectory: () => true }))
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce(stats({ size: 3 }));

    const result = await getFileProperties('D:/music');

    expect(result).toMatchObject({ fileCount: 2, totalSize: 3 });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      `getProperties stat failed for ${join('D:/music', 'a.mp3')}`,
      expect.any(Error)
    );
  });

  it('handles an empty directory', async () => {
    state.readdir.mockResolvedValueOnce([]);
    await expect(getFileProperties('D:/empty')).resolves.toMatchObject({
      itemCount: 0,
      dirCount: 0,
      fileCount: 0,
      totalSize: 0,
      truncated: false
    });
  });
});
