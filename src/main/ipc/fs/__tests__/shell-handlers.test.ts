import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  shellShow: vi.fn(),
  shellOpenPath: vi.fn(),
  getFileIcon: vi.fn(),
  getPath: vi.fn(),
  writeText: vi.fn(),
  readText: vi.fn(),
  showMessageBox: vi.fn(),
  fromWebContents: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
  iconSourcePath: vi.fn((path: string) => path),
  spawn: vi.fn(),
  candidates: vi.fn((platform: string, dir: string) => [`${platform}:${dir}`]),
  spawnFirst: vi.fn(),
  messages: {
    openExecCancel: 'Cancel',
    openExecOpen: 'Open',
    openExecTitle: 'Run?',
    openExecMessage: (path: string) => `run ${path}`,
    openExecDetail: 'Dangerous'
  },
  loggerWarn: vi.fn(),
  isSafe: vi.fn((path: unknown) => typeof path === 'string' && path !== 'bad')
}));

vi.mock('electron', () => ({
  shell: { showItemInFolder: state.shellShow, openPath: state.shellOpenPath },
  app: { getFileIcon: state.getFileIcon, getPath: state.getPath },
  clipboard: { writeText: state.writeText, readText: state.readText },
  dialog: { showMessageBox: state.showMessageBox },
  BrowserWindow: { fromWebContents: state.fromWebContents }
}));
vi.mock('fs/promises', () => ({ stat: state.stat, realpath: state.realpath }));
vi.mock('../../../utils/file-icon', () => ({ iconSourcePath: state.iconSourcePath }));
vi.mock('child_process', () => ({ spawn: state.spawn }));
vi.mock('../../../utils/terminal', () => ({
  terminalCandidates: state.candidates,
  spawnFirstAvailable: state.spawnFirst
}));
vi.mock('../../../i18n-main', () => ({ mainMessages: () => state.messages }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../../utils/validate', () => ({ isSafeAbsolutePath: state.isSafe }));

import {
  copyPath,
  getAppPath,
  getFileIcon,
  openTerminal,
  openWithDefault,
  readClipboard,
  showItemInFolder
} from '../shell-handlers';

const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  state.shellShow.mockReset();
  state.shellOpenPath.mockReset();
  state.shellOpenPath.mockResolvedValue('');
  state.getFileIcon.mockReset();
  state.getFileIcon.mockResolvedValue({ isEmpty: () => false, toDataURL: () => 'data:icon' });
  state.getPath.mockReset();
  state.getPath.mockImplementation((name: string) => `path:${name}`);
  state.writeText.mockReset();
  state.writeText.mockResolvedValue(undefined);
  state.readText.mockReset();
  state.readText.mockReturnValue('clipboard');
  state.showMessageBox.mockReset();
  state.showMessageBox.mockResolvedValue({ response: 1 });
  state.fromWebContents.mockReset();
  state.fromWebContents.mockReturnValue({ id: 'win' });
  state.stat.mockReset();
  state.stat.mockResolvedValue({ isDirectory: () => true });
  state.realpath.mockReset();
  state.realpath.mockImplementation(async (path: string) => path);
  state.iconSourcePath.mockClear();
  state.spawn.mockReset();
  state.spawn.mockReturnValue({ unref: vi.fn() });
  state.candidates.mockClear();
  state.spawnFirst.mockReset();
  state.spawnFirst.mockResolvedValue(true);
  state.loggerWarn.mockReset();
  state.isSafe.mockClear();
});

afterEach(async () => {
  await vi.advanceTimersByTimeAsync(600);
  vi.useRealTimers();
});

describe('showItemInFolder', () => {
  it('rejects unsafe paths', async () => {
    await showItemInFolder('bad');
    expect(state.shellShow).not.toHaveBeenCalled();
    expect(state.loggerWarn).toHaveBeenCalledWith('fs', 'showItemInFolder rejected invalid path');
  });

  it('reveals the file', async () => {
    await showItemInFolder('D:/a.mp3');
    expect(state.shellShow).toHaveBeenCalledWith('D:/a.mp3');
  });

  it('logs shell failures', async () => {
    state.shellShow.mockImplementation(() => {
      throw new Error('shell');
    });
    await showItemInFolder('D:/a.mp3');
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'showItemInFolder failed for D:/a.mp3',
      expect.any(Error)
    );
  });
});

describe('openTerminal', () => {
  it('rejects invalid paths and non-directories', async () => {
    await openTerminal('bad');
    expect(state.stat).not.toHaveBeenCalled();

    state.stat.mockResolvedValueOnce({ isDirectory: () => false });
    await openTerminal('D:/file.txt');
    expect(state.spawnFirst).not.toHaveBeenCalled();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'openTerminal rejected (not a directory): D:/file.txt'
    );
  });

  it('resolves symlinks and launches the platform terminal', async () => {
    state.realpath.mockResolvedValueOnce('D:/real');
    await openTerminal('D:/link');

    expect(state.candidates).toHaveBeenCalledWith(process.platform, 'D:/real');
    expect(state.spawnFirst).toHaveBeenCalledWith(
      [`${process.platform}:D:/real`],
      expect.any(Function)
    );
    const spawnFn = state.spawnFirst.mock.calls[0][1];
    spawnFn('cmd', ['/c'], { detached: true });
    expect(state.spawn).toHaveBeenCalledWith('cmd', ['/c'], { detached: true });
  });

  it('warns when no terminal exists', async () => {
    state.spawnFirst.mockResolvedValueOnce(false);
    await openTerminal('D:/dir');

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'openTerminal: no terminal emulator available for D:/dir'
    );
  });

  it('logs stat and realpath failures', async () => {
    state.stat.mockRejectedValueOnce(new Error('ENOENT'));
    await openTerminal('D:/missing');
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'openTerminal failed for D:/missing',
      expect.any(Error)
    );
  });

  it('allows only one detached shell at a time', async () => {
    let resolve!: (value: boolean) => void;
    state.spawnFirst.mockReturnValueOnce(
      new Promise<boolean>((res) => {
        resolve = res;
      })
    );

    const first = openTerminal('D:/one');
    await settle();
    await openTerminal('D:/two');

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'openTerminal rejected (one already opening)'
    );

    resolve(true);
    await first;
    await vi.advanceTimersByTimeAsync(500);

    await openTerminal('D:/three');
    expect(state.spawnFirst).toHaveBeenCalledTimes(2);
  });
});

describe('openWithDefault', () => {
  const event = { sender: {} } as never;

  it('rejects invalid paths', async () => {
    await openWithDefault(event, 'bad');
    expect(state.loggerWarn).toHaveBeenCalledWith('fs', 'openWithDefault rejected invalid path');
  });

  it('blocks shortcut files', async () => {
    state.realpath.mockResolvedValueOnce('D:/evil.lnk');
    await openWithDefault(event, 'D:/song.mp3');

    expect(state.shellOpenPath).not.toHaveBeenCalled();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'openWithDefault blocked (shortcut file): D:/song.mp3'
    );
  });

  it('requires confirmation for executables and honours cancellation', async () => {
    state.realpath.mockResolvedValueOnce('D:/calc.exe');
    state.showMessageBox.mockResolvedValueOnce({ response: 0 });

    await openWithDefault(event, 'D:/song.mp3');

    expect(state.showMessageBox).toHaveBeenCalledWith(
      { id: 'win' },
      expect.objectContaining({
        type: 'warning',
        buttons: ['Cancel', 'Open'],
        title: 'Run?',
        message: 'run D:/calc.exe',
        detail: 'Dangerous'
      })
    );
    expect(state.shellOpenPath).not.toHaveBeenCalled();
  });

  it('opens confirmed executables', async () => {
    state.realpath.mockResolvedValueOnce('D:/calc.exe');
    await openWithDefault(event, 'D:/song.mp3');

    expect(state.shellOpenPath).toHaveBeenCalledWith('D:/calc.exe');
  });

  it('uses message boxes without a parent window', async () => {
    state.fromWebContents.mockReturnValueOnce(null);
    state.realpath.mockResolvedValueOnce('D:/calc.exe');

    await openWithDefault(event, 'D:/setup.bat');

    expect(state.showMessageBox).toHaveBeenCalledWith(expect.any(Object));
  });

  it('opens regular files directly', async () => {
    await openWithDefault(event, 'D:/song.mp3');

    expect(state.showMessageBox).not.toHaveBeenCalled();
    expect(state.shellOpenPath).toHaveBeenCalledWith('D:/song.mp3');
  });

  it('logs failures', async () => {
    state.realpath.mockRejectedValueOnce(new Error('gone'));
    await openWithDefault(event, 'D:/song.mp3');

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'openWithDefault failed for D:/song.mp3',
      expect.any(Error)
    );
  });
});

describe('file icons', () => {
  it('rejects unsafe paths', async () => {
    await expect(getFileIcon('bad')).resolves.toBeNull();
    expect(state.getFileIcon).not.toHaveBeenCalled();
  });

  it('returns a data URL', async () => {
    await expect(getFileIcon('D:/a.mp3')).resolves.toBe('data:icon');
    expect(state.iconSourcePath).toHaveBeenCalledWith('D:/a.mp3');
    expect(state.getFileIcon).toHaveBeenCalledWith('D:/a.mp3', { size: 'large' });
  });

  it('returns null for empty icons', async () => {
    state.getFileIcon.mockResolvedValueOnce({ isEmpty: () => true });
    await expect(getFileIcon('D:/a.mp3')).resolves.toBeNull();
  });

  it('logs failures', async () => {
    state.getFileIcon.mockRejectedValueOnce(new Error('shell'));
    await expect(getFileIcon('D:/a.mp3')).resolves.toBeNull();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'getFileIcon failed for D:/a.mp3',
      expect.any(Error)
    );
  });
});

describe('clipboard and app paths', () => {
  it('copies valid strings', async () => {
    copyPath('D:/a.mp3');
    await settle();
    expect(state.writeText).toHaveBeenCalledWith('D:/a.mp3');
  });

  it('ignores invalid or oversized values', () => {
    copyPath(42);
    copyPath('a'.repeat(5000));
    expect(state.writeText).not.toHaveBeenCalled();
  });

  it('logs clipboard failures', async () => {
    state.writeText.mockRejectedValueOnce(new Error('busy'));
    copyPath('D:/a.mp3');
    await settle();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'fs',
      'clipboard.writeText failed',
      expect.any(Error)
    );
  });

  it('reads clipboard text', async () => {
    await expect(readClipboard()).resolves.toBe('clipboard');
  });

  it('falls back to empty clipboard text', async () => {
    state.readText.mockImplementation(() => {
      throw new Error('denied');
    });
    await expect(readClipboard()).resolves.toBe('');
  });

  it('exposes only desktop and downloads', () => {
    expect(getAppPath('desktop')).toBe('path:desktop');
    expect(getAppPath('downloads')).toBe('path:downloads');
    expect(getAppPath('userData')).toBe('');
    expect(state.getPath).toHaveBeenCalledTimes(2);
  });
});
