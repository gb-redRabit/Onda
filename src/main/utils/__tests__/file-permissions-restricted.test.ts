import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  writeFile: vi.fn(),
  chmod: vi.fn(),
  execFile: vi.fn(),
  userInfo: vi.fn(() => ({ username: 'tester' })),
  warn: vi.fn()
}));

vi.mock('fs/promises', () => ({ writeFile: h.writeFile, chmod: h.chmod }));
vi.mock('child_process', () => ({ execFile: h.execFile }));
vi.mock('os', () => ({ userInfo: h.userInfo }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));

import { restrictFilePermissions, writeFileRestricted } from '../file-permissions';

async function withPlatform<T>(value: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value, configurable: true });
  try {
    return await run();
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

beforeEach(() => {
  h.writeFile.mockReset().mockResolvedValue(undefined);
  h.chmod.mockReset().mockResolvedValue(undefined);
  h.execFile.mockReset().mockImplementation((_cmd, _args, _opts, cb) => cb(null));
  h.warn.mockClear();
});

describe('writeFileRestricted', () => {
  it('writes with mode 0600 and restricts permissions', async () => {
    await withPlatform('linux', () => writeFileRestricted('/tmp/x', 'data'));

    expect(h.writeFile).toHaveBeenCalledWith('/tmp/x', 'data', { mode: 0o600 });
    expect(h.chmod).toHaveBeenCalledWith('/tmp/x', 0o600);
  });
});

describe('restrictFilePermissions', () => {
  it('chmods files on POSIX', async () => {
    await withPlatform('darwin', () => restrictFilePermissions('/tmp/x'));

    expect(h.chmod).toHaveBeenCalledWith('/tmp/x', 0o600);
    expect(h.execFile).not.toHaveBeenCalled();
  });

  it('applies an icacls ACL on Windows', async () => {
    await withPlatform('win32', () => restrictFilePermissions('C:/x.txt'));

    expect(h.execFile).toHaveBeenCalledWith(
      'icacls',
      ['C:/x.txt', '/inheritance:r', '/grant:r', 'tester:F'],
      { windowsHide: true },
      expect.any(Function)
    );
    expect(h.chmod).not.toHaveBeenCalled();
  });

  it('logs and swallows icacls failures', async () => {
    const error = new Error('denied');
    h.execFile.mockImplementation((_cmd, _args, _opts, cb) => cb(error));

    await expect(
      withPlatform('win32', () => restrictFilePermissions('C:/x'))
    ).resolves.toBeUndefined();

    expect(h.warn).toHaveBeenCalledWith('permissions', 'failed to restrict ACL on C:/x', error);
  });
});
