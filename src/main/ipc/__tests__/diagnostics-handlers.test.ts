import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  getAppPath: vi.fn(() => 'C:/app'),
  readFile: vi.fn(),
  fromWebContents: vi.fn(),
  showSaveDialog: vi.fn(),
  environment: vi.fn(() => ({ version: '1' })),
  logTail: vi.fn(),
  clearLog: vi.fn(),
  copyLog: vi.fn(),
  warnings: vi.fn(() => [{ id: 1 }]),
  perf: vi.fn(() => ({ fps: 60 })),
  loggerWarn: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    }
  },
  dialog: { showSaveDialog: state.showSaveDialog },
  BrowserWindow: { fromWebContents: state.fromWebContents },
  app: { getAppPath: state.getAppPath }
}));
vi.mock('fs/promises', () => ({ readFile: state.readFile }));
vi.mock('../../log-file', () => ({
  readLogTail: state.logTail,
  clearLogFile: state.clearLog,
  copyLogTo: state.copyLog,
  getEnvironmentInfo: state.environment
}));
vi.mock('../../warnings', () => ({ getRecentWarnings: state.warnings }));
vi.mock('../../boot-timeline', () => ({ getPerfSnapshot: state.perf }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

import { registerDiagnosticsHandlers } from '../diagnostics-handlers';

const window = { id: 1 };

function call(channel: string, ...args: any[]) {
  return state.handlers.get(channel)!(...args);
}

beforeEach(() => {
  state.handlers.clear();
  state.getAppPath.mockClear();
  state.readFile.mockReset();
  state.fromWebContents.mockReset();
  state.fromWebContents.mockReturnValue(window);
  state.showSaveDialog.mockReset();
  state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/out/onda.log' });
  state.environment.mockClear();
  state.logTail.mockReset();
  state.logTail.mockReturnValue('tail');
  state.clearLog.mockReset();
  state.copyLog.mockReset();
  state.copyLog.mockResolvedValue(undefined);
  state.warnings.mockClear();
  state.perf.mockClear();
  state.loggerWarn.mockReset();
  registerDiagnosticsHandlers();
});

describe('registration', () => {
  it('registers diagnostics channels', () => {
    expect([...state.handlers.keys()]).toEqual([
      'app:getInfo',
      'app:getLicenses',
      'diagnostics:readLogs',
      'diagnostics:clearLogs',
      'diagnostics:getWarnings',
      'diagnostics:getPerf',
      'diagnostics:downloadLog'
    ]);
  });

  it('delegates simple lookups', () => {
    expect(call('app:getInfo')).toEqual({ version: '1' });
    expect(call('diagnostics:clearLogs')).toBeUndefined();
    expect(call('diagnostics:getWarnings')).toEqual([{ id: 1 }]);
    expect(call('diagnostics:getPerf')).toEqual({ fps: 60 });
    expect(state.environment).toHaveBeenCalled();
    expect(state.clearLog).toHaveBeenCalled();
  });
});

describe('licenses', () => {
  it('collects dependency metadata', async () => {
    state.readFile.mockImplementation(async (path: string) => {
      if (path === join('C:/app', 'package.json')) {
        return JSON.stringify({ dependencies: { alpha: '^1', beta: '^2' } });
      }
      if (path.includes(join('node_modules', 'alpha'))) {
        return JSON.stringify({ version: '1.2.3', license: 'MIT' });
      }
      throw new Error('missing');
    });

    await expect(call('app:getLicenses')).resolves.toEqual([
      { name: 'alpha', version: '1.2.3', license: 'MIT' },
      { name: 'beta' }
    ]);
    expect(state.getAppPath).toHaveBeenCalled();
  });

  it('returns an empty list when package.json cannot be read', async () => {
    state.readFile.mockRejectedValueOnce(new Error('ENOENT'));

    await expect(call('app:getLicenses')).resolves.toEqual([]);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'diagnostics',
      'app:getLicenses failed',
      expect.any(Error)
    );
  });

  it('handles packages without a dependencies field', async () => {
    state.readFile.mockResolvedValueOnce('{}');
    await expect(call('app:getLicenses')).resolves.toEqual([]);
  });
});

describe('logs', () => {
  it('clamps the requested line count', () => {
    expect(call('diagnostics:readLogs', {}, 100)).toBe('tail');
    expect(state.logTail).toHaveBeenLastCalledWith(100);

    call('diagnostics:readLogs', {}, 9999);
    expect(state.logTail).toHaveBeenLastCalledWith(2000);

    call('diagnostics:readLogs', {}, 0);
    expect(state.logTail).toHaveBeenLastCalledWith(undefined);

    call('diagnostics:readLogs', {}, 'nope');
    expect(state.logTail).toHaveBeenLastCalledWith(undefined);

    call('diagnostics:readLogs', {});
    expect(state.logTail).toHaveBeenLastCalledWith(undefined);
  });

  it('requires a window', async () => {
    state.fromWebContents.mockReturnValueOnce(null);
    await expect(call('diagnostics:downloadLog', { sender: {} })).resolves.toEqual({
      success: false,
      error: 'No window'
    });
  });

  it('saves the log through the dialog', async () => {
    await expect(call('diagnostics:downloadLog', { sender: {} })).resolves.toEqual({
      success: true
    });

    expect(state.showSaveDialog).toHaveBeenCalledWith(window, {
      title: 'Export Onda log',
      defaultPath: 'onda-main.log',
      filters: [{ name: 'Log', extensions: ['log'] }]
    });
    expect(state.copyLog).toHaveBeenCalledWith('C:/out/onda.log');
  });

  it('reports a cancelled dialog', async () => {
    state.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(call('diagnostics:downloadLog', { sender: {} })).resolves.toEqual({
      success: false,
      canceled: true
    });

    state.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: undefined });
    await expect(call('diagnostics:downloadLog', { sender: {} })).resolves.toEqual({
      success: false,
      canceled: true
    });
  });

  it('reports copy failures', async () => {
    state.copyLog.mockRejectedValueOnce(new Error('denied'));
    await expect(call('diagnostics:downloadLog', { sender: {} })).resolves.toEqual({
      success: false,
      error: 'denied'
    });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'diagnostics',
      'diagnostics:downloadLog failed',
      expect.any(Error)
    );

    state.copyLog.mockRejectedValueOnce('plain');
    await expect(call('diagnostics:downloadLog', { sender: {} })).resolves.toEqual({
      success: false,
      error: 'plain'
    });
  });
});
