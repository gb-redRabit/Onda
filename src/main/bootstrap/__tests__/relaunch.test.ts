import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  app: {
    getAppPath: () => '/app',
    isPackaged: false,
    relaunch: vi.fn(),
    exit: vi.fn()
  },
  spawn: vi.fn((..._args: any[]) => ({ unref: vi.fn() })),
  mkdirSync: vi.fn(),
  openSync: vi.fn(() => 7),
  closeSync: vi.fn(),
  getLogDir: vi.fn(() => '/logs'),
  warn: vi.fn()
}));

vi.mock('electron', () => ({ app: mocks.app }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs', () => ({
  mkdirSync: mocks.mkdirSync,
  openSync: mocks.openSync,
  closeSync: mocks.closeSync
}));
vi.mock('../../log-file', () => ({ getLogDir: mocks.getLogDir }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() }
}));

import { relaunchApp } from '../relaunch';

const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.app.isPackaged = false;
  mocks.app.relaunch.mockClear();
  mocks.app.exit.mockReset();
  mocks.spawn.mockClear();
  mocks.mkdirSync.mockClear();
  mocks.openSync.mockClear();
  mocks.closeSync.mockClear();
  mocks.warn.mockClear();
  delete env['ELECTRON_RENDERER_URL'];
  delete env['npm_node_execpath'];
});

afterEach(() => {
  vi.useRealTimers();
  delete env['ELECTRON_RENDERER_URL'];
  delete env['npm_node_execpath'];
});

describe('packaged build', () => {
  it('relaunches and exits after the delay', () => {
    mocks.app.isPackaged = true;

    relaunchApp();

    expect(mocks.app.relaunch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(mocks.app.relaunch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(mocks.app.relaunch).toHaveBeenCalledTimes(1);
    expect(mocks.app.exit).toHaveBeenCalledWith(0);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('honours a custom delay', () => {
    mocks.app.isPackaged = true;

    relaunchApp(50);
    vi.advanceTimersByTime(49);
    expect(mocks.app.exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.app.exit).toHaveBeenCalledWith(0);
  });
});

describe('development restart', () => {
  it('spawns a detached electron-vite dev process and closes the log fd', () => {
    env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    env['npm_node_execpath'] = 'C:/node/node.exe';

    relaunchApp(0);
    vi.advanceTimersByTime(0);

    expect(mocks.mkdirSync).toHaveBeenCalledWith('/logs', { recursive: true });
    expect(mocks.openSync).toHaveBeenCalledWith(join('/logs', 'dev-restart.log'), 'a');
    expect(mocks.spawn).toHaveBeenCalledWith(
      'C:/node/node.exe',
      [join('/app', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev'],
      {
        cwd: '/app',
        detached: true,
        stdio: ['ignore', 7, 7],
        windowsHide: true
      }
    );
    expect(mocks.spawn.mock.results[0].value.unref).toHaveBeenCalled();
    expect(mocks.closeSync).toHaveBeenCalledWith(7);
    expect(mocks.app.relaunch).not.toHaveBeenCalled();
    expect(mocks.app.exit).toHaveBeenCalledWith(0);
  });

  it('falls back to node when npm_node_execpath is missing', () => {
    env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';

    relaunchApp(0);
    vi.advanceTimersByTime(0);

    expect(mocks.spawn.mock.calls[0][0]).toBe('node');
  });

  it('only exits outside packaged mode without a renderer URL', () => {
    relaunchApp(0);
    vi.advanceTimersByTime(0);

    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.app.exit).toHaveBeenCalledWith(0);
  });
});

describe('failure handling', () => {
  it('logs and retries exit when the first exit throws', () => {
    mocks.app.isPackaged = true;
    mocks.app.exit.mockImplementationOnce(() => {
      throw new Error('closing');
    });

    relaunchApp(0);
    vi.advanceTimersByTime(0);

    expect(mocks.warn).toHaveBeenCalledWith(
      'relaunch',
      'app.exit threw - retrying',
      expect.any(Error)
    );
    expect(mocks.app.exit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);
    expect(mocks.app.exit).toHaveBeenCalledTimes(2);
    expect(mocks.app.exit).toHaveBeenLastCalledWith(0);
  });
});
