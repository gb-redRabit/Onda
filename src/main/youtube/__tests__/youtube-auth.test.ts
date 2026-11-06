import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Logowanie YouTube: okno, sesja i pliki są podstawione; pętla pollingu używa
// fake timerów, więc testy są deterministyczne.
const state = vi.hoisted(() => ({
  window: null as any,
  winOptions: null as any,
  destroyed: false,
  readFile: vi.fn(),
  unlink: vi.fn(),
  writeFileRestricted: vi.fn(),
  isValidCookieFile: vi.fn(() => true),
  isValidCookieFileAt: vi.fn(async () => true),
  hasSessionCookies: vi.fn((cookies: Array<{ name?: string }>) => (cookies.length ? ['sid'] : [])),
  getSessionCookies: vi.fn(async (): Promise<Array<{ name?: string; domain?: string }>> => []),
  exportSessionCookies: vi.fn(async () => true),
  restorePartitionSession: vi.fn(async () => undefined),
  writeTempSessionCookies: vi.fn(async (): Promise<string | null> => null),
  cookieFileValid: vi.fn(async () => true),
  getAuthSettings: vi.fn(),
  setAuthSettings: vi.fn(async () => undefined),
  clearStorageData: vi.fn(async () => undefined),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('electron', () => {
  return {
    BrowserWindow: function BrowserWindow(options: unknown) {
      state.winOptions = options;
      return state.window;
    },
    session: {
      defaultSession: { getUserAgent: () => 'Mozilla/5.0 Electron/40.0 Onda' },
      fromPartition: () => ({ clearStorageData: state.clearStorageData })
    }
  };
});
vi.mock('fs/promises', () => ({ readFile: state.readFile, unlink: state.unlink }));
vi.mock('../../utils/file-permissions', () => ({
  writeFileRestricted: state.writeFileRestricted
}));
vi.mock('../../ipc/youtube/youtube-utils', () => ({
  isValidCookieFile: state.isValidCookieFile
}));
vi.mock('../../../shared/logger', () => ({ logger: state.logger }));
vi.mock('../../pip/pip-icon', () => ({ pipWindowIcon: () => 'icon' }));
vi.mock('../youtube-auth-cookies', () => ({
  isValidCookieFileAt: state.isValidCookieFileAt,
  hasSessionCookies: state.hasSessionCookies,
  YT_COOKIE_HOST: '.youtube.com'
}));
vi.mock('../youtube-auth-settings', () => ({
  getAuthSettings: state.getAuthSettings,
  setAuthSettings: state.setAuthSettings
}));
vi.mock('../youtube-auth-session', () => ({
  AUTH_PARTITION: 'persist:youtube-auth',
  cookiesFilePath: () => '/data/cookies.txt',
  cookieFileHasValidYouTubeSession: state.cookieFileValid,
  exportSessionCookies: state.exportSessionCookies,
  getSessionCookies: state.getSessionCookies,
  restorePartitionSession: state.restorePartitionSession,
  writeTempSessionCookies: state.writeTempSessionCookies
}));

const {
  startGoogleLogin,
  logout,
  importCookiesFromFile,
  exportCookiesToFile,
  getAuthStatus,
  getYtAuthConfig,
  closeLoginWindow
} = await import('../youtube-auth');

function makeWindow() {
  const webContents = new EventEmitter() as EventEmitter & Record<string, any>;
  webContents.setWindowOpenHandler = vi.fn();
  webContents.setUserAgent = vi.fn();
  webContents.getURL = vi.fn(() => 'https://www.youtube.com/watch?v=1');
  const win = Object.assign(new EventEmitter(), {
    destroyed: false,
    webContents,
    isDestroyed: vi.fn(() => win.destroyed),
    show: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(() => {
      win.destroyed = true;
      win.emit('closed');
    }),
    loadURL: vi.fn(() => Promise.resolve())
  });
  return win;
}

beforeEach(() => {
  state.window = makeWindow();
  state.winOptions = null;
  state.destroyed = false;
  state.readFile.mockReset();
  state.readFile.mockResolvedValue('cookie-content');
  state.unlink.mockReset();
  state.unlink.mockResolvedValue(undefined);
  state.writeFileRestricted.mockReset();
  state.writeFileRestricted.mockResolvedValue(undefined);
  state.isValidCookieFile.mockReset();
  state.isValidCookieFile.mockReturnValue(true);
  state.isValidCookieFileAt.mockReset();
  state.isValidCookieFileAt.mockResolvedValue(true);
  state.hasSessionCookies.mockReset();
  state.hasSessionCookies.mockImplementation((cookies: unknown[]) =>
    cookies.length ? ['sid'] : []
  );
  state.getSessionCookies.mockReset();
  state.getSessionCookies.mockResolvedValue([]);
  state.exportSessionCookies.mockReset();
  state.exportSessionCookies.mockResolvedValue(true);
  state.restorePartitionSession.mockReset();
  state.restorePartitionSession.mockResolvedValue(undefined);
  state.writeTempSessionCookies.mockReset();
  state.writeTempSessionCookies.mockResolvedValue(null);
  state.cookieFileValid.mockReset();
  state.cookieFileValid.mockResolvedValue(true);
  state.getAuthSettings.mockReset();
  state.getAuthSettings.mockResolvedValue({
    method: 'none',
    cookiesPath: '',
    cookiesBrowser: undefined,
    lastLogin: null
  });
  state.setAuthSettings.mockClear();
  state.clearStorageData.mockClear();
  state.logger.info.mockClear();
  state.logger.warn.mockClear();
  state.logger.error.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startGoogleLogin', () => {
  it('reuses an already open login window', async () => {
    vi.useFakeTimers();
    state.window.destroyed = false;
    const first = startGoogleLogin();
    await Promise.resolve();
    state.window.destroyed = false;
    await expect(startGoogleLogin()).resolves.toMatchObject({
      success: false,
      canceled: true
    });
    state.window.destroyed = true;
    await vi.advanceTimersByTimeAsync(1000);
    await first;
  });

  it('creates a sandboxed window, strips Electron UA and loads YouTube', async () => {
    vi.useFakeTimers();
    state.getSessionCookies.mockResolvedValue([{ name: 'SID', domain: '.youtube.com' }]);
    state.exportSessionCookies.mockResolvedValue(true);

    const promise = startGoogleLogin();
    await vi.advanceTimersByTimeAsync(2500);
    await expect(promise).resolves.toEqual({ success: true });

    expect(state.winOptions).toMatchObject({
      width: 960,
      height: 720,
      title: 'Google Sign-In',
      show: false,
      webPreferences: {
        partition: 'persist:youtube-auth',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    expect(state.window.loadURL).toHaveBeenCalledWith('https://www.youtube.com/');
    expect(state.window.webContents.setUserAgent).toHaveBeenCalledWith('Mozilla/5.0 Onda');
    expect(state.window.webContents.setWindowOpenHandler).toHaveBeenCalled();
    expect(state.setAuthSettings).toHaveBeenCalledWith({
      method: 'electron',
      cookiesPath: '/data/cookies.txt',
      lastLogin: expect.any(Number)
    });
    expect(state.window.close).toHaveBeenCalled();
  });

  it('shows the window when ready and logs renderer crashes', async () => {
    vi.useFakeTimers();
    state.getSessionCookies.mockResolvedValue([]);
    const promise = startGoogleLogin();
    state.window.emit('ready-to-show');
    expect(state.window.show).toHaveBeenCalled();
    state.window.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    expect(state.logger.warn).toHaveBeenCalledWith('ytauth', 'login renderer gone', 'crashed', 1);
    state.window.destroyed = true;
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ success: false, canceled: true });
  });

  it('returns canceled when the window is closed by the user', async () => {
    vi.useFakeTimers();
    state.getSessionCookies.mockResolvedValue([]);
    const promise = startGoogleLogin();
    state.window.close();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ success: false, canceled: true });
  });

  it('times out after ten minutes', async () => {
    vi.useFakeTimers();
    state.getSessionCookies.mockResolvedValue([]);
    const promise = startGoogleLogin();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 2000);
    await expect(promise).resolves.toEqual({ success: false, error: 'Login timed out' });
    expect(state.window.close).toHaveBeenCalled();
  });

  it('waits for two stable cookie polls before exporting', async () => {
    vi.useFakeTimers();
    state.getSessionCookies
      .mockResolvedValueOnce([{ name: 'SID' }])
      .mockResolvedValueOnce([{ name: 'SID' }]);
    const promise = startGoogleLogin();
    await vi.advanceTimersByTimeAsync(2500);
    await expect(promise).resolves.toMatchObject({ success: true });
    expect(state.exportSessionCookies).toHaveBeenCalled();
  });

  it('ignores ERR_ABORTED load errors and logs other failures', async () => {
    vi.useFakeTimers();
    state.window.loadURL = vi.fn(() => Promise.reject(new Error('ERR_ABORTED (-3)')));
    state.getSessionCookies.mockResolvedValue([]);
    const promise = startGoogleLogin();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.logger.warn).not.toHaveBeenCalledWith(
      'ytauth',
      'login window load failed',
      expect.anything()
    );
    state.window.destroyed = true;
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    state.window = makeWindow();
    state.window.loadURL = vi.fn(() => Promise.reject(new Error('net error')));
    const second = startGoogleLogin();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.logger.warn).toHaveBeenCalledWith(
      'ytauth',
      'login window load failed',
      'net error'
    );
    state.window.destroyed = true;
    await vi.advanceTimersByTimeAsync(1000);
    await second;
  });
});

describe('logout', () => {
  it('clears the partition, cookie file and settings', async () => {
    await logout();
    expect(state.clearStorageData).toHaveBeenCalledWith({ storages: ['cookies'] });
    expect(state.unlink).toHaveBeenCalledWith('/data/cookies.txt');
    expect(state.setAuthSettings).toHaveBeenCalledWith({
      method: 'none',
      cookiesPath: '',
      lastLogin: null
    });
  });

  it('continues when clearing the partition fails', async () => {
    state.clearStorageData.mockRejectedValue(new Error('no session'));
    await expect(logout()).resolves.toBeUndefined();
    expect(state.logger.warn).toHaveBeenCalled();
    expect(state.setAuthSettings).toHaveBeenCalled();
  });
});

describe('cookie file import/export', () => {
  it('rejects an invalid cookie file', async () => {
    state.isValidCookieFile.mockReturnValue(false);
    await expect(importCookiesFromFile('/tmp/cookies.txt')).resolves.toEqual({
      success: false,
      error: 'Invalid cookies file format (Netscape expected)'
    });
    expect(state.writeFileRestricted).not.toHaveBeenCalled();
  });

  it('writes normalized content and records manual auth', async () => {
    state.readFile.mockResolvedValue('line1\nline2\n');
    await expect(importCookiesFromFile('/tmp/cookies.txt')).resolves.toEqual({ success: true });

    const eol = process.platform === 'win32' ? '\r\n' : '\n';
    expect(state.writeFileRestricted).toHaveBeenCalledWith(
      '/data/cookies.txt',
      `line1${eol}line2${eol}`
    );
    expect(state.setAuthSettings).toHaveBeenCalledWith({
      method: 'manual',
      cookiesPath: '/data/cookies.txt',
      lastLogin: expect.any(Number)
    });
  });

  it('reports read errors on import', async () => {
    state.readFile.mockRejectedValue(new Error('missing'));
    await expect(importCookiesFromFile('/tmp/missing')).resolves.toEqual({
      success: false,
      error: 'missing'
    });
  });

  it('exports through the restricted writer', async () => {
    state.readFile.mockResolvedValue('cookie-content');
    await expect(exportCookiesToFile('/tmp/out.txt')).resolves.toEqual({ success: true });
    expect(state.writeFileRestricted).toHaveBeenCalledWith('/tmp/out.txt', 'cookie-content');
  });

  it('reports write errors on export', async () => {
    state.writeFileRestricted.mockRejectedValue(new Error('denied'));
    await expect(exportCookiesToFile('/tmp/out.txt')).resolves.toEqual({
      success: false,
      error: 'denied'
    });
  });
});

describe('getAuthStatus', () => {
  it('checks electron sessions and restores them when stale', async () => {
    state.getAuthSettings.mockResolvedValue({
      method: 'electron',
      cookiesPath: '/data/cookies.txt',
      cookiesBrowser: 'chrome',
      lastLogin: 5
    });
    state.exportSessionCookies.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const status = await getAuthStatus();

    expect(status).toMatchObject({
      method: 'electron',
      loggedIn: true,
      cookiesPath: '/data/cookies.txt',
      browser: 'chrome',
      lastLogin: 5
    });
    expect(state.restorePartitionSession).toHaveBeenCalled();
  });

  it('falls back to the cookie file when re-export fails', async () => {
    state.getAuthSettings.mockResolvedValue({
      method: 'electron',
      cookiesPath: '',
      lastLogin: null
    });
    state.exportSessionCookies.mockResolvedValue(false);
    state.cookieFileValid.mockResolvedValue(true);

    await expect(getAuthStatus()).resolves.toMatchObject({ loggedIn: true });
  });

  it('checks manual and browser methods', async () => {
    state.getAuthSettings.mockResolvedValue({ method: 'manual', cookiesPath: '/cookies.txt' });
    state.isValidCookieFileAt.mockResolvedValue(true);
    await expect(getAuthStatus()).resolves.toMatchObject({ method: 'manual', loggedIn: true });

    state.getAuthSettings.mockResolvedValue({ method: 'browser', cookiesBrowser: 'firefox' });
    await expect(getAuthStatus()).resolves.toMatchObject({
      method: 'browser',
      loggedIn: true,
      browser: 'firefox'
    });

    state.getAuthSettings.mockResolvedValue({ method: 'none' });
    await expect(getAuthStatus()).resolves.toMatchObject({ method: 'none', loggedIn: false });
  });

  it('reports check errors', async () => {
    state.getAuthSettings.mockResolvedValue({ method: 'manual', cookiesPath: '/c' });
    state.isValidCookieFileAt.mockRejectedValue(new Error('io'));
    await expect(getAuthStatus()).resolves.toMatchObject({ loggedIn: false, error: 'io' });
    expect(state.logger.warn).toHaveBeenCalled();
  });
});

describe('getYtAuthConfig', () => {
  it('returns null for none', async () => {
    state.getAuthSettings.mockResolvedValue({ method: 'none' });
    await expect(getYtAuthConfig()).resolves.toBeNull();
  });

  it('uses a temporary file for electron sessions and restores when missing', async () => {
    state.getAuthSettings.mockResolvedValue({ method: 'electron' });
    state.writeTempSessionCookies
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('/tmp/live.txt');

    await expect(getYtAuthConfig()).resolves.toEqual({
      method: 'electron',
      cookiesPath: '/tmp/live.txt',
      temp: true
    });
    expect(state.restorePartitionSession).toHaveBeenCalled();
  });

  it('returns null when an electron session cannot be recovered', async () => {
    state.getAuthSettings.mockResolvedValue({ method: 'electron' });
    state.writeTempSessionCookies.mockResolvedValue(null);
    await expect(getYtAuthConfig()).resolves.toBeNull();
  });

  it('validates manual cookie files', async () => {
    state.getAuthSettings.mockResolvedValue({ method: 'manual', cookiesPath: '/cookies.txt' });
    state.isValidCookieFileAt.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(getYtAuthConfig()).resolves.toEqual({
      method: 'manual',
      cookiesPath: '/cookies.txt'
    });
    await expect(getYtAuthConfig()).resolves.toBeNull();
  });

  it('returns browser config only with a browser name', async () => {
    state.getAuthSettings.mockResolvedValue({ method: 'browser', cookiesBrowser: 'chrome' });
    await expect(getYtAuthConfig()).resolves.toEqual({
      method: 'browser',
      cookiesBrowser: 'chrome'
    });

    state.getAuthSettings.mockResolvedValue({ method: 'browser' });
    await expect(getYtAuthConfig()).resolves.toBeNull();
  });
});

describe('closeLoginWindow', () => {
  it('closes a live window and is safe without one', async () => {
    vi.useFakeTimers();
    state.getSessionCookies.mockResolvedValue([]);
    const run = startGoogleLogin();
    closeLoginWindow();
    expect(state.window.close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await run;

    state.window.destroyed = true;
    expect(() => closeLoginWindow()).not.toThrow();
  });
});
