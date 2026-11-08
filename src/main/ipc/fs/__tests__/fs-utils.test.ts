import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  access: vi.fn(),
  lstat: vi.fn(),
  statfs: vi.fn(),
  execAsync: vi.fn(),
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
  loggerWarn: vi.fn(),
  hashFile: vi.fn(),
  platform: 'linux'
}));

vi.mock('fs/promises', () => ({
  access: state.access,
  lstat: state.lstat,
  statfs: state.statfs
}));
vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
  extname: (p: string) => {
    const base = p.split('/').pop() || '';
    const index = base.lastIndexOf('.');
    return index > 0 ? base.slice(index) : '';
  },
  basename: (p: string, ext?: string) => {
    const base = p.split('/').pop() || '';
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
  },
  dirname: (p: string) => p.slice(0, p.lastIndexOf('/')) || p
}));
vi.mock('child_process', () => ({ exec: vi.fn() }));
vi.mock('util', () => ({ promisify: () => state.execAsync }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../../utils/with-timeout', () => ({ withTimeout: state.withTimeout }));
vi.mock('../../../utils/hash', () => ({ hashFile: state.hashFile }));

async function load() {
  return import('../fs-utils');
}

function stats(overrides: Record<string, unknown> = {}) {
  return {
    isDirectory: () => false,
    size: 1024,
    mtimeMs: 1_700_000_000_000,
    birthtimeMs: 1_600_000_000_000,
    ...overrides
  } as never;
}

beforeEach(() => {
  state.access.mockReset();
  state.access.mockRejectedValue(new Error('ENOENT'));
  state.lstat.mockReset();
  state.lstat.mockRejectedValue(new Error('ENOENT'));
  state.statfs.mockReset();
  state.statfs.mockResolvedValue({ bsize: 4096, blocks: 1000, bavail: 500 });
  state.execAsync.mockReset();
  state.execAsync.mockResolvedValue({ stdout: '' });
  state.withTimeout.mockReset();
  state.withTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  state.loggerWarn.mockReset();
  state.hashFile.mockReset();
  state.platform = 'linux';
  vi.spyOn(process, 'platform', 'get').mockImplementation(() => state.platform as NodeJS.Platform);
});

describe('volumeUsageFromStatfs', () => {
  it('computes total and free bytes', async () => {
    const { volumeUsageFromStatfs } = await load();
    expect(volumeUsageFromStatfs({ bsize: 100, blocks: 10, bavail: 4 })).toEqual({
      total: 1000,
      free: 400
    });
  });

  it('clamps invalid free values', async () => {
    const { volumeUsageFromStatfs } = await load();
    expect(volumeUsageFromStatfs({ bsize: 100, blocks: 10, bavail: 20 })).toEqual({
      total: 1000,
      free: 1000
    });
    expect(volumeUsageFromStatfs({ bsize: 100, blocks: 10, bavail: -5 })).toEqual({
      total: 1000,
      free: 0
    });
    expect(volumeUsageFromStatfs({ bsize: 100, blocks: 10, bavail: Number.NaN })).toEqual({
      total: 1000,
      free: 0
    });
  });

  it('returns zeros for invalid totals', async () => {
    const { volumeUsageFromStatfs } = await load();
    expect(volumeUsageFromStatfs({ bsize: 0, blocks: 10, bavail: 5 })).toEqual({
      total: 0,
      free: 0
    });
    expect(volumeUsageFromStatfs({ bsize: Number.NaN, blocks: 10, bavail: 5 })).toEqual({
      total: 0,
      free: 0
    });
    expect(volumeUsageFromStatfs({ bsize: 100, blocks: -1, bavail: 5 })).toEqual({
      total: 0,
      free: 0
    });
  });
});

describe('getDriveUsage', () => {
  it('returns the root volume on non-Windows platforms', async () => {
    const { getDriveUsage } = await load();
    expect(await getDriveUsage()).toEqual([
      { name: '/', path: '/', total: 4096000, free: 2048000 }
    ]);
    expect(state.statfs).toHaveBeenCalledWith('/');
  });

  it('returns a zeroed root when statfs fails', async () => {
    state.statfs.mockRejectedValueOnce(new Error('no volume'));
    const { getDriveUsage } = await load();
    expect(await getDriveUsage()).toEqual([{ name: '/', path: '/', total: 0, free: 0 }]);
  });

  it('scans drive letters on Windows', async () => {
    state.platform = 'win32';
    state.access.mockImplementation(async (root: string) => {
      if (root === 'C:\\' || root === 'D:\\') return undefined;
      throw new Error('missing');
    });
    state.statfs.mockImplementation(async (root: string) => ({
      bsize: 100,
      blocks: 10,
      bavail: root === 'C:\\' ? 5 : 2
    }));
    const { getDriveUsage } = await load();

    expect(await getDriveUsage()).toEqual([
      { name: 'C:', path: 'C:\\', total: 1000, free: 500 },
      { name: 'D:', path: 'D:\\', total: 1000, free: 200 }
    ]);
    expect(state.access).toHaveBeenCalledWith('C:\\');
    expect(state.access).toHaveBeenCalledWith('Z:\\');
  });

  it('skips letters whose access check throws', async () => {
    state.platform = 'win32';
    const { getDriveUsage } = await load();
    expect(await getDriveUsage()).toEqual([]);
  });
});

describe('getDrives', () => {
  it('maps PowerShell output', async () => {
    state.platform = 'win32';
    state.execAsync.mockResolvedValueOnce({
      stdout: JSON.stringify([
        { Name: 'C', Root: 'C:\\', Free: 10, Used: 20 },
        { Name: 'D', Root: 'D:\\', Free: null, Used: null }
      ])
    });
    const { getDrives } = await load();
    const drives = await getDrives();
    expect(drives).toHaveLength(2);
    expect(drives[0]).toMatchObject({
      name: 'C:',
      path: 'C:\\',
      isDirectory: true,
      size: 30,
      extension: ''
    });
    expect(drives[1].size).toBe(0);
    expect(state.execAsync).toHaveBeenCalledWith(
      expect.stringContaining('Get-PSDrive'),
      expect.objectContaining({ encoding: 'utf-8', timeout: 15000, windowsHide: true })
    );
  });

  it('accepts a single object response', async () => {
    state.platform = 'win32';
    state.execAsync.mockResolvedValueOnce({
      stdout: JSON.stringify({ Name: 'E', Root: 'E:\\', Free: 1, Used: 2 })
    });
    const { getDrives } = await load();
    expect(await getDrives()).toEqual([
      expect.objectContaining({ name: 'E:', path: 'E:\\', size: 3 })
    ]);
  });

  it('filters malformed entries', async () => {
    state.platform = 'win32';
    state.execAsync.mockResolvedValueOnce({
      stdout: JSON.stringify([null, {}, { Name: 'C', Free: 1, Used: 1 }])
    });
    const { getDrives } = await load();
    expect(await getDrives()).toEqual([
      expect.objectContaining({ name: 'C:', path: 'C:\\', size: 2 })
    ]);
  });

  it('falls back to letter scanning for empty or invalid output', async () => {
    state.platform = 'win32';
    state.access.mockImplementation(async (root: string) => {
      if (root === 'F:\\') return undefined;
      throw new Error('missing');
    });
    state.execAsync.mockResolvedValueOnce({ stdout: '   ' });
    const { getDrives } = await load();
    expect(await getDrives()).toEqual([expect.objectContaining({ name: 'F:', path: 'F:\\' })]);

    state.execAsync.mockResolvedValueOnce({ stdout: 'not json' });
    expect(await getDrives()).toEqual([expect.objectContaining({ name: 'F:' })]);
    expect(state.loggerWarn).toHaveBeenCalledWith('fs', 'could not parse drive list output');
  });

  it('falls back when PowerShell throws', async () => {
    state.platform = 'win32';
    state.execAsync.mockRejectedValueOnce(new Error('powershell'));
    state.access.mockRejectedValue(new Error('missing'));
    const { getDrives } = await load();
    expect(await getDrives()).toEqual([]);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'getDrives (win32) failed',
      expect.any(Error)
    );
  });

  it('returns platform roots on macOS and Linux', async () => {
    state.platform = 'darwin';
    const { getDrives } = await load();
    expect(await getDrives()).toEqual([
      expect.objectContaining({ name: 'Macintosh HD', path: '/', isDirectory: true })
    ]);

    state.platform = 'linux';
    expect(await getDrives()).toEqual([
      expect.objectContaining({ name: '/', path: '/', isDirectory: true })
    ]);
  });

  it('normalises Windows drive names without appending separators twice', async () => {
    state.platform = 'win32';
    state.execAsync.mockResolvedValueOnce({
      stdout: JSON.stringify([{ Name: 'C:', Free: 0, Used: 0 }])
    });
    const { getDrives } = await load();
    expect((await getDrives())[0]).toMatchObject({ name: 'C::', path: 'C::' });
  });
});

describe('getFileItem', () => {
  it('maps stats to a file item', async () => {
    const { getFileItem } = await load();
    expect(getFileItem('C:/music/Song.MP3', stats(), 'Song.MP3')).toEqual({
      name: 'Song.MP3',
      path: 'C:/music/Song.MP3',
      isDirectory: false,
      size: 1024,
      modifiedAt: 1_700_000_000_000,
      createdAt: 1_600_000_000_000,
      extension: '.mp3',
      mimeType: undefined
    });
  });

  it('marks directories', async () => {
    const { getFileItem } = await load();
    const item = getFileItem('C:/dir', stats({ isDirectory: () => true }), 'dir');
    expect(item.isDirectory).toBe(true);
    expect(item.extension).toBe('');
  });
});

describe('stripDuplicateSuffix', () => {
  const cases: Array<[string, string | null]> = [
    ['Song - Copy.mp3', 'Song.mp3'],
    ['Song - Kopiuj.flac', 'Song.flac'],
    ['Song — kopia.mp3', 'Song.mp3'],
    ['Song – kopia (2).mp3', 'Song.mp3'],
    ['Song (copy).mp3', 'Song.mp3'],
    ['Song (copy 2).mp3', 'Song.mp3'],
    ['Song (kopia).mp3', 'Song.mp3'],
    ['Song (kopia 3).mp3', 'Song.mp3'],
    ['Song copy.mp3', 'Song.mp3'],
    ['Song copy 2.mp3', 'Song.mp3'],
    ['Song (2).mp3', 'Song.mp3'],
    ['Song 3.mp3', 'Song.mp3'],
    ['Song (final).mp3', null],
    ['Song.mp3', null],
    ['Song', null],
    ['.hidden', null]
  ];

  it.each(cases)('normalises %s', async (input, expected) => {
    const { stripDuplicateSuffix } = await load();
    expect(stripDuplicateSuffix(input)).toBe(expected);
  });
});

describe('uniqueDestPath', () => {
  it('returns the destination when free', async () => {
    const { uniqueDestPath } = await load();
    expect(await uniqueDestPath('C:/dir/file.mp3')).toBe('C:/dir/file.mp3');
  });

  it('appends increasing suffixes until free', async () => {
    state.lstat
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('free'));
    const { uniqueDestPath } = await load();
    expect(await uniqueDestPath('C:/dir/file.mp3')).toBe('C:/dir/file (3).mp3');
  });

  it('returns the original path after exhausting candidates', async () => {
    state.lstat.mockResolvedValue({});
    const { uniqueDestPath } = await load();
    expect(await uniqueDestPath('C:/dir/file.mp3')).toBe('C:/dir/file.mp3');
  });
});

describe('fileHash re-export', () => {
  it('re-exports the shared hash implementation', async () => {
    const { fileHash } = await load();
    expect(fileHash).toBe(state.hashFile);
  });
});
