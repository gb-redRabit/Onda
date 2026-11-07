import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyItems, findDuplicates, moveItems, validateTransferArgs } from '../fs-transfer';

const state = vi.hoisted(() => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  lstat: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
  copyFile: vi.fn(),
  cp: vi.fn(),
  rename: vi.fn(),
  realpath: vi.fn(),
  stripDuplicateSuffix: vi.fn(),
  fileHash: vi.fn(),
  uniqueDestPath: vi.fn(),
  isSafeAbsolutePath: vi.fn(),
  isSafeStringArray: vi.fn(),
  isProtectedDestructivePath: vi.fn(),
  parentOf: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('fs/promises', () => ({
  readdir: state.readdir,
  stat: state.stat,
  lstat: state.lstat,
  unlink: state.unlink,
  rm: state.rm,
  copyFile: state.copyFile,
  cp: state.cp,
  rename: state.rename,
  realpath: state.realpath
}));
vi.mock('../fs-utils', () => ({
  stripDuplicateSuffix: state.stripDuplicateSuffix,
  fileHash: state.fileHash,
  uniqueDestPath: state.uniqueDestPath
}));
vi.mock('../../../utils/validate', () => ({
  isSafeAbsolutePath: state.isSafeAbsolutePath,
  isSafeStringArray: state.isSafeStringArray
}));
vi.mock('../../../path-policy', () => ({
  isProtectedDestructivePath: state.isProtectedDestructivePath,
  parentOf: state.parentOf
}));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.warn, error: state.error, info: vi.fn() }
}));

function dirent(name: string, file = true) {
  return { name, isFile: () => file };
}

function fileStats(size = 100) {
  return { size, isFile: () => true, isDirectory: () => false };
}

function dirStats() {
  return { size: 0, isFile: () => false, isDirectory: () => true };
}

beforeEach(() => {
  for (const spy of [
    state.readdir,
    state.stat,
    state.lstat,
    state.unlink,
    state.rm,
    state.copyFile,
    state.cp,
    state.rename,
    state.realpath,
    state.stripDuplicateSuffix,
    state.fileHash,
    state.uniqueDestPath,
    state.isSafeAbsolutePath,
    state.isSafeStringArray,
    state.isProtectedDestructivePath,
    state.parentOf,
    state.warn,
    state.error
  ]) {
    spy.mockReset();
  }
  state.isSafeAbsolutePath.mockReturnValue(true);
  state.isSafeStringArray.mockReturnValue(true);
  state.isProtectedDestructivePath.mockReturnValue(false);
  state.parentOf.mockReturnValue('');
  state.stripDuplicateSuffix.mockImplementation((name: string) => name);
  state.uniqueDestPath.mockImplementation(async (path: string) => path);
  state.fileHash.mockResolvedValue('hash');
  state.stat.mockResolvedValue(fileStats());
  state.lstat.mockResolvedValue(fileStats());
  state.realpath.mockResolvedValue('C:/real');
  state.readdir.mockResolvedValue([]);
  state.rename.mockResolvedValue(undefined);
  state.copyFile.mockResolvedValue(undefined);
  state.cp.mockResolvedValue(undefined);
  state.unlink.mockResolvedValue(undefined);
  state.rm.mockResolvedValue(undefined);
});

describe('findDuplicates', () => {
  it('rejects invalid directories', async () => {
    state.isSafeAbsolutePath.mockReturnValue(false);
    expect(await findDuplicates('bad')).toEqual([]);
    expect(state.warn).toHaveBeenCalled();
  });

  it('groups duplicates by stripped name and hash', async () => {
    state.readdir.mockResolvedValue([
      dirent('a.mp3'),
      dirent('a (1).mp3'),
      dirent('a (2).mp3'),
      dirent('b.mp3'),
      dirent('folder', false)
    ]);
    state.stripDuplicateSuffix.mockImplementation((name: string) => name.replace(/ \(\d+\)/, ''));
    state.stat.mockImplementation(async (path: string) => {
      if (path.endsWith('a (1).mp3')) return fileStats(100);
      if (path.endsWith('a (2).mp3')) return fileStats(100);
      return fileStats(100);
    });
    state.fileHash.mockImplementation(async (path: string) =>
      path.includes('a') ? 'hash-a' : 'hash-b'
    );

    const groups = await findDuplicates('C:/dir');

    expect(groups).toEqual([
      {
        original: 'C:\\dir\\a.mp3',
        duplicates: ['C:\\dir\\a (1).mp3', 'C:\\dir\\a (2).mp3']
      }
    ]);
  });

  it('uses a candidate as reference when the original is missing', async () => {
    state.readdir.mockResolvedValue([dirent('a (1).mp3'), dirent('a (2).mp3')]);
    state.stripDuplicateSuffix.mockImplementation((name: string) => name.replace(/ \(\d+\)/, ''));
    state.stat.mockImplementation(async (path: string) => {
      if (path === 'C:\\dir\\a.mp3') throw new Error('missing');
      return fileStats(100);
    });

    const groups = await findDuplicates('C:/dir');
    expect(groups).toHaveLength(1);
    expect(groups[0].original).toBe('C:\\dir\\a (1).mp3');
    expect(groups[0].duplicates).toEqual(['C:\\dir\\a (2).mp3']);
  });

  it('skips a lone candidate when the original is missing', async () => {
    state.readdir.mockResolvedValue([dirent('a (1).mp3')]);
    state.stripDuplicateSuffix.mockReturnValue('a.mp3');
    state.stat.mockRejectedValue(new Error('missing'));

    expect(await findDuplicates('C:/dir')).toEqual([]);
  });

  it('logs and skips reference stat/hash failures', async () => {
    state.readdir.mockResolvedValue([dirent('a.mp3'), dirent('a (1).mp3')]);
    state.stripDuplicateSuffix.mockReturnValue('a.mp3');
    state.stat.mockResolvedValue(fileStats(100));
    state.fileHash.mockRejectedValueOnce(new Error('hash failed'));

    expect(await findDuplicates('C:/dir')).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith(
      'fs',
      expect.stringContaining('duplicate reference hash failed'),
      expect.any(Error)
    );
  });

  it('skips missing references and oversized files', async () => {
    state.readdir.mockResolvedValue([dirent('a (1).mp3'), dirent('a (2).mp3')]);
    state.stripDuplicateSuffix.mockReturnValue('a.mp3');
    state.stat
      .mockRejectedValueOnce(new Error('missing'))
      .mockRejectedValueOnce(new Error('also missing'));

    expect(await findDuplicates('C:/dir')).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith(
      'fs',
      expect.stringContaining('duplicate reference stat failed'),
      expect.any(Error)
    );

    state.stat.mockResolvedValue(fileStats(3 * 1024 * 1024 * 1024));
    expect(await findDuplicates('C:/dir')).toEqual([]);
  });

  it('ignores empty hashes and compares only matching sizes and hashes', async () => {
    state.readdir.mockResolvedValue([dirent('a.mp3'), dirent('a (1).mp3'), dirent('a (2).mp3')]);
    state.stripDuplicateSuffix.mockReturnValue('a.mp3');
    state.stat.mockImplementation(async (path: string) => {
      if (path.endsWith('a (1).mp3')) return fileStats(100);
      if (path.endsWith('a (2).mp3')) return fileStats(200);
      return fileStats(100);
    });
    state.fileHash.mockImplementation(async (path: string) =>
      path.endsWith('a.mp3') ? '' : 'different'
    );
    expect(await findDuplicates('C:/dir')).toEqual([]);

    state.fileHash.mockImplementation(async (path: string) =>
      path.endsWith('a (1).mp3') ? 'same' : 'other'
    );
    state.fileHash.mockImplementation(async (path: string) => {
      if (path.endsWith('a.mp3')) return 'ref';
      if (path.endsWith('a (1).mp3')) return 'ref';
      return 'other';
    });
    state.stat.mockImplementation(async () => fileStats(100));
    const groups = await findDuplicates('C:/dir');
    expect(groups[0].duplicates).toEqual(['C:\\dir\\a (1).mp3']);
  });

  it('logs compare failures and readdir failures', async () => {
    state.readdir.mockResolvedValue([dirent('a.mp3'), dirent('a (1).mp3')]);
    state.stripDuplicateSuffix.mockReturnValue('a.mp3');
    state.stat
      .mockResolvedValueOnce(fileStats(100))
      .mockRejectedValueOnce(new Error('stat failed'));
    expect(await findDuplicates('C:/dir')).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith(
      'fs',
      expect.stringContaining('duplicate compare failed'),
      expect.any(Error)
    );

    state.readdir.mockRejectedValueOnce(new Error('readdir failed'));
    expect(await findDuplicates('C:/dir')).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith(
      'fs',
      expect.stringContaining('findDuplicates failed'),
      expect.any(Error)
    );
  });
});

describe('validateTransferArgs', () => {
  it('rejects invalid arguments', async () => {
    state.isSafeStringArray.mockReturnValue(false);
    expect(await validateTransferArgs(null, 'C:/dst', 'copy')).toBeNull();
    expect(state.warn).toHaveBeenCalled();

    state.isSafeStringArray.mockReturnValue(true);
    state.isSafeAbsolutePath.mockReturnValue(false);
    expect(await validateTransferArgs(['C:/a'], 'bad', 'copy')).toBeNull();
  });

  it('rejects protected destinations after resolving symlinks', async () => {
    state.isProtectedDestructivePath.mockImplementation((path: string) => path === 'C:/real');
    expect(await validateTransferArgs(['C:/a'], 'C:/dst', 'copy')).toBeNull();
    expect(state.warn).toHaveBeenCalledWith('fs', expect.stringContaining('protected destination'));
  });

  it('filters unsafe sources and protected move sources', async () => {
    state.isSafeAbsolutePath.mockImplementation((path: string) => path !== 'bad');
    state.realpath.mockImplementation(async (path: string) => path);
    state.isProtectedDestructivePath.mockImplementation((path: string) => path === 'C:/protected');

    const result = await validateTransferArgs(['C:/ok', 'bad', 'C:/protected'], 'C:/dst', 'move', [
      'C:/extra'
    ]);
    expect(result).toEqual({ sources: ['C:/ok'], destination: 'C:/dst' });
    expect(state.isProtectedDestructivePath).toHaveBeenCalledWith(
      'C:/protected',
      process.platform,
      ['C:/extra']
    );
  });

  it('keeps protected sources when copying', async () => {
    state.realpath.mockImplementation(async (path: string) => path);
    state.isProtectedDestructivePath.mockReturnValue(false);
    const result = await validateTransferArgs(['C:/protected'], 'C:/dst', 'copy');
    expect(result?.sources).toEqual(['C:/protected']);
  });

  it('resolves a missing target through its parent', async () => {
    state.realpath.mockRejectedValueOnce(new Error('missing')).mockResolvedValueOnce('C:/parent');
    state.parentOf.mockReturnValue('C:/parent');
    state.isProtectedDestructivePath.mockReturnValue(false);

    await validateTransferArgs(['C:/a'], 'C:/parent/new', 'copy');
    expect(state.realpath).toHaveBeenLastCalledWith('C:/parent');
  });

  it('falls back to the raw target when parent resolution fails', async () => {
    state.realpath.mockRejectedValue(new Error('nope'));
    state.parentOf.mockReturnValue('C:/parent');
    await validateTransferArgs(['C:/a'], 'C:/parent/new', 'copy');
    expect(state.isProtectedDestructivePath).toHaveBeenCalledWith(
      'C:/parent/new',
      process.platform,
      []
    );
  });
});

describe('moveItems', () => {
  it('renames each source and skips same destinations', async () => {
    state.uniqueDestPath.mockImplementation(async (path: string) => path);
    await moveItems(['C:/a', 'C:/b'], 'C:/dst');

    expect(state.rename).toHaveBeenCalledWith('C:/a', 'C:\\dst\\a');
    expect(state.rename).toHaveBeenCalledWith('C:/b', 'C:\\dst\\b');
  });

  it('skips case-insensitive identical destinations', async () => {
    state.uniqueDestPath.mockImplementation(async () => 'C:/A');
    await moveItems(['C:/a'], 'C:/dst');
    expect(state.rename).not.toHaveBeenCalled();
  });

  it('falls back to copy + delete for directories', async () => {
    state.rename.mockRejectedValue(new Error('cross-device'));
    state.lstat.mockResolvedValue(dirStats());

    await moveItems(['C:/dir'], 'C:/dst');
    expect(state.cp).toHaveBeenCalledWith('C:/dir', 'C:\\dst\\dir', { recursive: true });
    expect(state.rm).toHaveBeenCalledWith('C:/dir', { recursive: true, force: true });
  });

  it('falls back to copy + unlink for files', async () => {
    state.rename.mockRejectedValue(new Error('cross-device'));
    state.lstat.mockResolvedValue(fileStats());

    await moveItems(['C:/file.txt'], 'C:/dst');
    expect(state.copyFile).toHaveBeenCalledWith('C:/file.txt', 'C:\\dst\\file.txt');
    expect(state.unlink).toHaveBeenCalledWith('C:/file.txt');
  });

  it('logs fallback failures', async () => {
    state.rename.mockRejectedValue(new Error('cross-device'));
    state.lstat.mockRejectedValue(new Error('gone'));

    await moveItems(['C:/file.txt'], 'C:/dst');
    expect(state.error).toHaveBeenCalledWith(
      'fs',
      'fs:move failed for C:/file.txt',
      expect.any(Error)
    );
  });

  it('does nothing for rejected arguments', async () => {
    state.isSafeStringArray.mockReturnValue(false);
    await moveItems(null, 'C:/dst');
    expect(state.rename).not.toHaveBeenCalled();
  });
});

describe('copyItems', () => {
  it('copies directories and files', async () => {
    state.lstat.mockResolvedValueOnce(dirStats()).mockResolvedValueOnce(fileStats());

    await copyItems(['C:/dir', 'C:/file.txt'], 'C:/dst');

    expect(state.cp).toHaveBeenCalledWith('C:/dir', 'C:\\dst\\dir', { recursive: true });
    expect(state.copyFile).toHaveBeenCalledWith('C:/file.txt', 'C:\\dst\\file.txt');
  });

  it('logs copy failures and skips rejected arguments', async () => {
    state.lstat.mockRejectedValue(new Error('gone'));
    await copyItems(['C:/file.txt'], 'C:/dst');
    expect(state.error).toHaveBeenCalledWith(
      'fs',
      'fs:copy failed for C:/file.txt',
      expect.any(Error)
    );

    state.error.mockClear();
    state.isSafeStringArray.mockReturnValue(false);
    await copyItems(null, 'C:/dst');
    expect(state.error).not.toHaveBeenCalled();
  });
});
