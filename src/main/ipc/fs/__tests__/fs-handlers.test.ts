import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileItem } from '../../../../shared/types/explorer';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  getPath: vi.fn(),
  trashItem: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  lstat: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
  realpath: vi.fn(),
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
  warn: vi.fn(),
  errMsg: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  getDrives: vi.fn(),
  getDriveUsage: vi.fn(),
  getFileItem: vi.fn(),
  visibleEntries: vi.fn(),
  getFileProperties: vi.fn(),
  isSafeAbsolutePath: vi.fn(),
  readTextFile: vi.fn(),
  isProtectedPath: vi.fn(),
  isProtectedDestructivePath: vi.fn(),
  parentOf: vi.fn(),
  getStore: vi.fn(),
  findDuplicates: vi.fn(),
  moveItems: vi.fn(),
  copyItems: vi.fn(),
  showItemInFolder: vi.fn(),
  openTerminal: vi.fn(),
  openWithDefault: vi.fn(),
  getFileIcon: vi.fn(),
  copyPath: vi.fn(),
  readClipboard: vi.fn(),
  getAppPath: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPath: state.getPath },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.handlers[channel] = fn;
    }
  },
  shell: { trashItem: state.trashItem }
}));
vi.mock('fs/promises', () => ({
  readdir: state.readdir,
  stat: state.stat,
  mkdir: state.mkdir,
  lstat: state.lstat,
  unlink: state.unlink,
  rm: state.rm,
  realpath: state.realpath
}));
vi.mock('path', () => ({ join: (...parts: string[]) => parts.join('/') }));
vi.mock('../../../utils/with-timeout', () => ({ withTimeout: state.withTimeout }));
vi.mock('../../../i18n-main', () => ({ mainMessages: {} }));
vi.mock('../../../../shared/helpers', () => ({ errMsg: state.errMsg }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../fs-utils', () => ({
  getDrives: state.getDrives,
  getDriveUsage: state.getDriveUsage,
  getFileItem: state.getFileItem
}));
vi.mock('../fs-visible', () => ({ visibleEntries: state.visibleEntries }));
vi.mock('../fs-properties', () => ({ getFileProperties: state.getFileProperties }));
vi.mock('../../../utils/validate', () => ({ isSafeAbsolutePath: state.isSafeAbsolutePath }));
vi.mock('../../../utils/read-text-file', () => ({
  readTextFileWithinBounds: state.readTextFile,
  TEXT_EXTS: ['txt'],
  TEXT_MAX_BYTES: 10
}));
vi.mock('../../../path-policy', () => ({
  isProtectedPath: state.isProtectedPath,
  isProtectedDestructivePath: state.isProtectedDestructivePath,
  parentOf: state.parentOf
}));
vi.mock('../../cover/cover-cache', () => ({ getStore: state.getStore }));
vi.mock('../fs-transfer', () => ({
  findDuplicates: state.findDuplicates,
  moveItems: state.moveItems,
  copyItems: state.copyItems
}));
vi.mock('../shell-handlers', () => ({
  showItemInFolder: state.showItemInFolder,
  openTerminal: state.openTerminal,
  openWithDefault: state.openWithDefault,
  getFileIcon: state.getFileIcon,
  copyPath: state.copyPath,
  readClipboard: state.readClipboard,
  getAppPath: state.getAppPath
}));

async function load() {
  vi.resetModules();
  const module = await import('../fs-handlers');
  module.registerFsHandlers();
  return state.handlers;
}

function fileItem(path: string): FileItem {
  return { path, name: path, isDirectory: false, extension: 'mp3' } as FileItem;
}

function sender() {
  return { sender: { send: vi.fn() } };
}

beforeEach(() => {
  state.handlers = {};
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && 'mockReset' in value) {
      (value as { mockReset: () => void }).mockReset();
    }
  }
  state.withTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  state.getPath.mockImplementation((name: string) => `C:/${name}`);
  state.getDrives.mockReturnValue([fileItem('C:/')]);
  state.getDriveUsage.mockResolvedValue([{ drive: 'C:', free: 1 }]);
  state.getFileProperties.mockResolvedValue({ size: 1 });
  state.getFileItem.mockImplementation((path: string) => fileItem(path));
  state.visibleEntries.mockImplementation((entries: unknown[]) => entries);
  state.isSafeAbsolutePath.mockReturnValue(true);
  state.isProtectedPath.mockReturnValue(false);
  state.isProtectedDestructivePath.mockReturnValue(false);
  state.parentOf.mockReturnValue('C:/parent');
  state.readdir.mockResolvedValue([]);
  state.stat.mockResolvedValue({ isFile: () => true });
  state.mkdir.mockResolvedValue(undefined);
  state.lstat.mockResolvedValue({ isDirectory: () => false, isSymbolicLink: () => false });
  state.unlink.mockResolvedValue(undefined);
  state.rm.mockResolvedValue(undefined);
  state.realpath.mockRejectedValue(new Error('missing'));
  state.getStore.mockResolvedValue({ get: () => undefined });
  state.trashItem.mockResolvedValue(undefined);
  state.findDuplicates.mockResolvedValue([{ original: 'a', duplicates: ['b'] }]);
  state.moveItems.mockResolvedValue(undefined);
  state.copyItems.mockResolvedValue(undefined);
  state.showItemInFolder.mockResolvedValue(undefined);
  state.openTerminal.mockResolvedValue(undefined);
  state.openWithDefault.mockResolvedValue(undefined);
  state.getFileIcon.mockResolvedValue('icon');
  state.copyPath.mockResolvedValue(undefined);
  state.readClipboard.mockResolvedValue('clip');
  state.getAppPath.mockReturnValue('C:/app');
  state.readTextFile.mockResolvedValue({ ok: true, text: 'content' });
});

describe('basic fs handlers', () => {
  it('returns drives, usage, properties and duplicate groups', async () => {
    const h = await load();
    expect(await h['fs:getDrives']()).toEqual([fileItem('C:/')]);
    expect(await h['fs:getDriveUsage']()).toEqual([{ drive: 'C:', free: 1 }]);
    expect(await h['fs:getProperties']({}, 'C:/file')).toEqual({ size: 1 });
    expect(await h['fs:findDuplicates']({}, 'C:/dir')).toEqual([
      { original: 'a', duplicates: ['b'] }
    ]);
  });

  it('handles usage and property failures', async () => {
    const h = await load();
    state.getDriveUsage.mockRejectedValueOnce(new Error('disk'));
    expect(await h['fs:getDriveUsage']()).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith('fs', 'getDriveUsage failed', expect.any(Error));

    state.isSafeAbsolutePath.mockReturnValueOnce(false);
    expect(await h['fs:getProperties']({}, 'bad')).toBeNull();

    state.getFileProperties.mockRejectedValueOnce(new Error('stat'));
    expect(await h['fs:getProperties']({}, 'C:/file')).toBeNull();
  });
});

describe('fs:readdir', () => {
  it('lists drives for empty and drive paths', async () => {
    const h = await load();
    const ev = sender();

    await h['fs:readdir'](ev, '');
    await h['fs:readdir'](ev, '/');
    await h['fs:readdir'](ev, 'C:');
    expect(ev.sender.send).toHaveBeenCalledTimes(3);
    expect(ev.sender.send).toHaveBeenCalledWith('fs:readdir:batch', {
      done: true,
      items: [fileItem('C:/')]
    });
  });

  it('rejects invalid paths and reports readdir errors', async () => {
    const h = await load();
    const ev = sender();

    state.isSafeAbsolutePath.mockReturnValueOnce(false);
    await h['fs:readdir'](ev, 'bad');
    expect(ev.sender.send).toHaveBeenCalledWith('fs:readdir:batch', { done: true, items: [] });

    state.readdir.mockRejectedValueOnce(new Error('denied'));
    await h['fs:readdir'](ev, 'C:/dir');
    expect(ev.sender.send).toHaveBeenLastCalledWith('fs:readdir:batch', {
      done: true,
      items: [],
      error: 'denied'
    });
  });

  it('streams filtered entries in batches and skips stat failures', async () => {
    const h = await load();
    const ev = sender();
    const entries = [{ name: 'a.mp3' }, { name: 'b.mp3' }, { name: 'hidden' }];
    state.readdir.mockResolvedValueOnce(entries);
    state.visibleEntries.mockReturnValueOnce([entries[0], entries[1], entries[2]]);
    state.stat
      .mockResolvedValueOnce({ isFile: () => true })
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce({ isFile: () => true });

    await h['fs:readdir'](ev, 'C:/dir', { showHidden: true });

    expect(state.visibleEntries).toHaveBeenCalledWith(entries, true);
    expect(ev.sender.send).toHaveBeenCalledWith('fs:readdir:batch', {
      done: false,
      items: [fileItem('C:/dir/a.mp3'), fileItem('C:/dir/hidden')]
    });
    expect(ev.sender.send).toHaveBeenLastCalledWith('fs:readdir:batch', { done: true, items: [] });
  });
});

describe('fs:mkdir', () => {
  it('creates directories and rejects invalid or protected paths', async () => {
    const h = await load();
    expect(await h['fs:mkdir']({}, 'C:/dir')).toBe(true);
    expect(state.mkdir).toHaveBeenCalledWith('C:/dir', { recursive: true });

    state.isSafeAbsolutePath.mockReturnValueOnce(false);
    expect(await h['fs:mkdir']({}, 'bad')).toBe(false);

    state.isProtectedPath.mockReturnValueOnce(true);
    expect(await h['fs:mkdir']({}, 'C:/Windows/x')).toBe(false);

    state.mkdir.mockRejectedValueOnce(new Error('exists'));
    expect(await h['fs:mkdir']({}, 'C:/dir')).toBe(false);
  });

  it('rejects paths whose existing ancestor is protected', async () => {
    const h = await load();
    state.isProtectedPath.mockReturnValueOnce(false).mockReturnValueOnce(true);
    state.stat.mockRejectedValueOnce(new Error('missing'));

    expect(await h['fs:mkdir']({}, 'C:/project/sub')).toBe(false);
    expect(state.isProtectedPath).toHaveBeenCalledWith('C:/parent');
  });
});

describe('fs:delete', () => {
  it('rejects invalid and protected paths', async () => {
    const h = await load();
    state.isSafeAbsolutePath.mockReturnValueOnce(false);
    expect(await h['fs:delete']({}, 'bad')).toBe(false);

    state.isProtectedDestructivePath.mockReturnValueOnce(true);
    expect(await h['fs:delete']({}, 'C:/Windows')).toBe(false);

    state.isProtectedDestructivePath.mockReturnValueOnce(false).mockReturnValueOnce(true);
    state.realpath.mockResolvedValueOnce('C:/real');
    expect(await h['fs:delete']({}, 'C:/link')).toBe(false);
  });

  it('uses the trash by default', async () => {
    const h = await load();
    expect(await h['fs:delete']({}, 'C:/file')).toBe(true);
    expect(state.trashItem).toHaveBeenCalledWith('C:/file');
  });

  it('permanently deletes files, directories and symlinks when configured', async () => {
    const h = await load();
    state.getStore.mockResolvedValue({ get: () => ({ permanentDelete: true }) });

    state.lstat.mockResolvedValueOnce({ isDirectory: () => false, isSymbolicLink: () => true });
    expect(await h['fs:delete']({}, 'C:/link')).toBe(true);
    expect(state.unlink).toHaveBeenCalledWith('C:/link');

    state.lstat.mockResolvedValueOnce({ isDirectory: () => true, isSymbolicLink: () => false });
    expect(await h['fs:delete']({}, 'C:/dir')).toBe(true);
    expect(state.rm).toHaveBeenCalledWith('C:/dir', { recursive: true, force: true });

    state.lstat.mockResolvedValueOnce({ isDirectory: () => false, isSymbolicLink: () => false });
    expect(await h['fs:delete']({}, 'C:/file')).toBe(true);
    expect(state.unlink).toHaveBeenLastCalledWith('C:/file');
  });

  it('returns false when deletion fails', async () => {
    const h = await load();
    state.getStore.mockRejectedValueOnce(new Error('store'));
    expect(await h['fs:delete']({}, 'C:/file')).toBe(false);

    state.getStore.mockResolvedValue({ get: () => ({ permanentDelete: true }) });
    state.lstat.mockRejectedValueOnce(new Error('gone'));
    expect(await h['fs:delete']({}, 'C:/file')).toBe(false);
    expect(state.warn).toHaveBeenCalledWith('fs', 'delete failed for C:/file', expect.any(Error));
  });
});

describe('transfer and shell handlers', () => {
  it('forwards move/copy with profile roots', async () => {
    const h = await load();
    await h['fs:move']({}, ['C:/a'], 'C:/dst');
    expect(state.moveItems).toHaveBeenCalledWith(['C:/a'], 'C:/dst', [
      'C:/home',
      'C:/appData',
      'C:/userData'
    ]);

    await h['fs:copy']({}, ['C:/a'], 'C:/dst');
    expect(state.copyItems).toHaveBeenCalledWith(['C:/a'], 'C:/dst', [
      'C:/home',
      'C:/appData',
      'C:/userData'
    ]);
  });

  it('uses no extra roots when app paths are unavailable', async () => {
    const h = await load();
    state.getPath.mockImplementation(() => {
      throw new Error('no path');
    });
    await h['fs:move']({}, ['C:/a'], 'C:/dst');
    expect(state.moveItems).toHaveBeenCalledWith(['C:/a'], 'C:/dst', []);
  });

  it('forwards shell actions', async () => {
    const h = await load();
    const ev = { sender: {} };

    h['shell:showItemInFolder'](ev, 'C:/file');
    await h['shell:openTerminal'](ev, 'C:/dir');
    await h['shell:openWithDefault'](ev, 'C:/file');
    expect(await h['shell:getFileIcon'](ev, 'C:/file')).toBe('icon');
    h['fs:copyPath'](ev, 'C:/file');
    expect(await h['app:readClipboard'](ev)).toBe('clip');
    expect(h['app:getPath'](ev, 'home')).toBe('C:/app');

    expect(state.showItemInFolder).toHaveBeenCalledWith('C:/file');
    expect(state.openTerminal).toHaveBeenCalledWith('C:/dir');
    expect(state.openWithDefault).toHaveBeenCalledWith(ev, 'C:/file');
    expect(state.getFileIcon).toHaveBeenCalledWith('C:/file');
    expect(state.copyPath).toHaveBeenCalledWith('C:/file');
    expect(state.getAppPath).toHaveBeenCalledWith('home');
  });
});

describe('text and existing paths', () => {
  it('reads bounded text files', async () => {
    const h = await load();
    expect(await h['fs:readTextFile']({}, 'C:/a.txt')).toBe('content');
    expect(state.readTextFile).toHaveBeenCalledWith('C:/a.txt', ['txt'], 10, 'fs');

    state.readTextFile.mockResolvedValueOnce({ ok: false });
    expect(await h['fs:readTextFile']({}, 'C:/a.bin')).toBeNull();
  });

  it('filters existing paths to valid strings', async () => {
    const h = await load();
    state.isSafeAbsolutePath.mockImplementation((path: string) => path !== 'bad');
    state.stat.mockResolvedValueOnce({}).mockResolvedValue({});
    state.stat.mockImplementation(async (path: string) => {
      if (path === 'C:/missing') throw new Error('gone');
      return {};
    });

    expect(await h['fs:existing']({}, null)).toEqual([]);
    expect(await h['fs:existing']({}, [1, 'bad', 'C:/ok', 'C:/missing'])).toEqual(['C:/ok']);
  });
});
