import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handles: new Map<string, (...args: any[]) => any>(),
  fromWebContents: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  startLogin: vi.fn(),
  logout: vi.fn(),
  importCookies: vi.fn(),
  exportCookies: vi.fn(),
  getStatus: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      h.handles.set(channel, handler);
    }
  },
  dialog: { showOpenDialog: h.showOpenDialog, showSaveDialog: h.showSaveDialog },
  BrowserWindow: { fromWebContents: h.fromWebContents }
}));
vi.mock('../../youtube/youtube-auth', () => ({
  startGoogleLogin: h.startLogin,
  logout: h.logout,
  importCookiesFromFile: h.importCookies,
  exportCookiesToFile: h.exportCookies,
  getAuthStatus: h.getStatus
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

import { registerYoutubeAuthHandlers } from '../youtube/youtube-auth-handlers';

const event = { sender: {} };
const window = { id: 1 };

function call(channel: string, ...args: unknown[]) {
  return h.handles.get(channel)!(event, ...args);
}

beforeEach(() => {
  h.handles.clear();
  h.fromWebContents.mockReset();
  h.fromWebContents.mockReturnValue(window);
  h.showOpenDialog.mockReset();
  h.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['D:/cookies.txt'] });
  h.showSaveDialog.mockReset();
  h.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'D:/export.txt' });
  h.startLogin.mockReset();
  h.startLogin.mockResolvedValue({ success: true });
  h.logout.mockReset();
  h.logout.mockResolvedValue(undefined);
  h.importCookies.mockReset();
  h.importCookies.mockResolvedValue({ success: true });
  h.exportCookies.mockReset();
  h.exportCookies.mockResolvedValue({ success: true });
  h.getStatus.mockReset();
  h.getStatus.mockResolvedValue({ method: 'cookies', loggedIn: true });
  h.loggerWarn.mockReset();
  registerYoutubeAuthHandlers();
});

describe('registration', () => {
  it('registers every auth channel', () => {
    expect([...h.handles.keys()]).toEqual([
      'yt:authStatus',
      'yt:login',
      'yt:logout',
      'yt:importCookies',
      'yt:exportCookies'
    ]);
  });
});

describe('status and login', () => {
  it('returns the auth status', async () => {
    await expect(call('yt:authStatus')).resolves.toEqual({
      method: 'cookies',
      loggedIn: true
    });
  });

  it('falls back to logged-out on status failures', async () => {
    h.getStatus.mockRejectedValueOnce(new Error('keyring'));

    await expect(call('yt:authStatus')).resolves.toEqual({
      method: 'none',
      loggedIn: false
    });
    expect(h.loggerWarn).toHaveBeenCalledWith('yt', 'yt:authStatus failed', expect.any(Error));
  });

  it('delegates login', async () => {
    await expect(call('yt:login')).resolves.toEqual({ success: true });
    expect(h.startLogin).toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('reports success', async () => {
    await expect(call('yt:logout')).resolves.toEqual({ success: true });
    expect(h.logout).toHaveBeenCalled();
  });

  it('reports Error and plain failures', async () => {
    h.logout.mockRejectedValueOnce(new Error('nope'));
    await expect(call('yt:logout')).resolves.toEqual({ success: false, error: 'nope' });

    h.logout.mockRejectedValueOnce('plain');
    await expect(call('yt:logout')).resolves.toEqual({ success: false, error: 'plain' });
  });
});

describe('cookie import', () => {
  it('requires a window', async () => {
    h.fromWebContents.mockReturnValueOnce(null);
    await expect(call('yt:importCookies')).resolves.toEqual({
      success: false,
      error: 'No window'
    });
    expect(h.showOpenDialog).not.toHaveBeenCalled();
  });

  it('uses the open dialog and imports the selected file', async () => {
    await expect(call('yt:importCookies')).resolves.toEqual({ success: true });

    expect(h.showOpenDialog).toHaveBeenCalledWith(window, {
      title: 'Import cookies',
      properties: ['openFile'],
      filters: [{ name: 'Cookies', extensions: ['txt'] }]
    });
    expect(h.importCookies).toHaveBeenCalledWith('D:/cookies.txt');
  });

  it('reports cancellation and empty selections', async () => {
    h.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: ['x'] });
    await expect(call('yt:importCookies')).resolves.toEqual({
      success: false,
      canceled: true
    });

    h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] });
    await expect(call('yt:importCookies')).resolves.toEqual({
      success: false,
      canceled: true
    });
    expect(h.importCookies).not.toHaveBeenCalled();
  });
});

describe('cookie export', () => {
  it('requires a window', async () => {
    h.fromWebContents.mockReturnValueOnce(null);
    await expect(call('yt:exportCookies')).resolves.toEqual({
      success: false,
      error: 'No window'
    });
    expect(h.showSaveDialog).not.toHaveBeenCalled();
  });

  it('uses the save dialog and exports the file', async () => {
    await expect(call('yt:exportCookies')).resolves.toEqual({ success: true });

    expect(h.showSaveDialog).toHaveBeenCalledWith(window, {
      title: 'Export cookies',
      defaultPath: 'youtube-cookies.txt',
      filters: [{ name: 'Cookies', extensions: ['txt'] }]
    });
    expect(h.exportCookies).toHaveBeenCalledWith('D:/export.txt');
  });

  it('reports cancellation and missing paths', async () => {
    h.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(call('yt:exportCookies')).resolves.toEqual({
      success: false,
      canceled: true
    });

    h.showSaveDialog.mockResolvedValueOnce({ canceled: false });
    await expect(call('yt:exportCookies')).resolves.toEqual({
      success: false,
      canceled: true
    });
    expect(h.exportCookies).not.toHaveBeenCalled();
  });
});
