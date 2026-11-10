import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface CookieLike {
  domain: string;
  name: string;
  value: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expirationDate?: number;
}

const h = vi.hoisted(() => {
  type Listener = (...args: any[]) => void;
  class FakeBrowserWindow {
    opts: any;
    listeners = new Map<string, Listener[]>();
    destroyed = false;
    webContents: any;
    focus = vi.fn();
    show = vi.fn();
    loadURL = vi.fn(async () => {
      if (h.loadError) throw h.loadError;
    });
    constructor(opts: any) {
      this.opts = opts;
      const session = h.sessionFromPartition(opts?.webPreferences?.partition ?? 'default');
      this.webContents = {
        session,
        setWindowOpenHandler: vi.fn(),
        setUserAgent: vi.fn(),
        executeJavaScript: vi.fn(async () => {
          if (h.jsError) throw h.jsError;
          return h.jsValue;
        })
      };
      h.windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    once(event: string, cb: Listener) {
      const list = this.listeners.get(event) ?? [];
      list.push(cb);
      this.listeners.set(event, list);
      return this;
    }
    on(event: string, cb: Listener) {
      return this.once(event, cb);
    }
    emit(event: string) {
      for (const cb of this.listeners.get(event) ?? []) cb();
    }
    close() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.emit('closed');
    }
    destroy() {
      this.close();
    }
  }
  const windows: FakeBrowserWindow[] = [];
  const appHandlers: Record<string, Listener> = {};
  const cookies = { current: [] as CookieLike[] };
  const partitions = new Map<string, any>();
  const sessionFromPartition = (partition: string) => {
    let ses = partitions.get(partition);
    if (!ses) {
      ses = {
        partition,
        setUserAgent: vi.fn(),
        cookies: {
          get: vi.fn(async () => {
            if (h.cookiesError) throw h.cookiesError;
            return cookies.current;
          }),
          set: vi.fn(async ({ name }: { name: string }) => {
            if (h.rejectCookie?.test(name)) throw new Error('rejected cookie');
          })
        }
      };
      partitions.set(partition, ses);
    }
    return ses;
  };
  return {
    windows,
    appHandlers,
    cookies,
    partitions,
    sessionFromPartition,
    FakeBrowserWindow,
    cookiesError: null as Error | null,
    rejectCookie: null as RegExp | null,
    loadError: null as Error | null,
    googleCookies: [] as CookieLike[],
    googleError: null as Error | null,
    jsValue: '' as string,
    jsError: null as Error | null,
    setProviderCookie: vi.fn(async () => true),
    setProviderToken: vi.fn(async () => true),
    setProviderRefresh: vi.fn(async () => true),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn()
  };
});

vi.mock('electron', () => ({
  BrowserWindow: h.FakeBrowserWindow,
  session: {
    defaultSession: {},
    fromPartition: h.sessionFromPartition
  },
  app: {
    on: (event: string, cb: (...args: any[]) => void) => {
      h.appHandlers[event] = cb;
    },
    removeListener: vi.fn()
  }
}));
vi.mock('../../pip/pip-icon', () => ({ pipWindowIcon: () => '/icon.ico' }));
vi.mock('../provider-credentials', () => ({
  setProviderCookie: h.setProviderCookie,
  setProviderToken: h.setProviderToken,
  setProviderRefresh: h.setProviderRefresh
}));
vi.mock('../../../youtube/youtube-auth-session', () => ({
  getSessionCookies: async () => {
    if (h.googleError) throw h.googleError;
    return h.googleCookies;
  }
}));
vi.mock('../../../../shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: h.loggerWarn, error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  return import('../provider-login');
}

async function flush(rounds = 40): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

function win() {
  return h.windows.at(-1)!;
}

function providerCookie(domain = '.google.com', name = 'SID', value = 'v') {
  return { domain, name, value };
}

beforeEach(() => {
  vi.useFakeTimers();
  h.windows.length = 0;
  h.partitions.clear();
  h.cookies.current = [];
  h.cookiesError = null;
  h.rejectCookie = null;
  h.loadError = null;
  h.googleCookies = [];
  h.googleError = null;
  h.jsValue = '';
  h.jsError = null;
  for (const key of Object.keys(h.appHandlers)) delete h.appHandlers[key];
  h.setProviderCookie.mockReset();
  h.setProviderCookie.mockResolvedValue(true);
  h.setProviderToken.mockReset();
  h.setProviderToken.mockResolvedValue(true);
  h.setProviderRefresh.mockReset();
  h.setProviderRefresh.mockResolvedValue(true);
  h.loggerInfo.mockReset();
  h.loggerWarn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('partitions and window lifecycle', () => {
  it('lists the legacy and per-provider partitions', async () => {
    const login = await load();
    expect(login.providerLoginPartitions()).toEqual([
      'persist:provider-login',
      'persist:provider-login-pikpak',
      'persist:provider-login-gdrive'
    ]);
  });

  it('shows the login window once it is ready', async () => {
    const login = await load();
    void login.startProviderLogin('pikpak');
    const window = win();

    window.emit('ready-to-show');
    expect(window.show).toHaveBeenCalled();
  });

  it('focuses an already-open login window', async () => {
    const login = await load();
    const first = login.startProviderLogin('pikpak');
    const window = win();
    await flush();

    const second = await login.startProviderLogin('pikpak');
    expect(second).toMatchObject({ success: false, canceled: true });
    expect(window.focus).toHaveBeenCalled();

    window.close();
    await first;
  });

  it('closes the active login window and tolerates repeats', async () => {
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();

    login.closeProviderLoginWindow();
    expect(window.destroyed).toBe(true);
    expect(() => login.closeProviderLoginWindow()).not.toThrow();

    await pending;
  });

  it('clears a destroyed window reference without closing it again', async () => {
    const login = await load();
    const first = login.startProviderLogin('pikpak');
    const window = win();
    window.destroyed = true;

    login.closeProviderLoginWindow();
    const second = login.startProviderLogin('pikpak');
    await flush();
    expect(h.windows).toHaveLength(2);

    win().close();
    await second;
    await vi.advanceTimersByTimeAsync(1000);
    await first;
  });
});

describe('Google seeding', () => {
  it('copies a YouTube session and logs the count', async () => {
    h.googleCookies = [
      providerCookie('.google.com', 'SID', 's1'),
      { domain: '', name: 'BAD', value: 'x' },
      { domain: '.google.com', name: '', value: 'x' },
      { domain: '.google.com', name: 'EMPTY', value: '' }
    ];
    const login = await load();
    const pending = login.startProviderLogin('gdrive');
    const window = win();
    await flush();

    const target = h.sessionFromPartition('persist:provider-login-gdrive');
    expect(target.cookies.set).toHaveBeenCalledTimes(1);
    expect(target.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SID', url: 'https://google.com/' })
    );
    expect(h.loggerInfo).toHaveBeenCalledWith(
      'providers',
      'seeded 1 Google cookies for gdrive login'
    );
    expect(window.loadURL).toHaveBeenCalledWith('https://drive.google.com/');

    h.cookies.current = [providerCookie()];
    window.close();
    await expect(pending).resolves.toEqual({ success: true });
  });

  it('starts on the Google page when no session is available', async () => {
    h.cookies.current = [providerCookie('.google.com', 'SID', 'g')];
    const login = await load();
    const pending = login.startProviderLogin('gdrive');
    const window = win();
    await flush();

    expect(window.loadURL).toHaveBeenCalledWith('https://accounts.google.com/');

    await vi.advanceTimersByTimeAsync(1000);
    expect(window.loadURL).toHaveBeenCalledWith('https://drive.google.com/');

    h.cookies.current = [
      providerCookie('.google.com', 'SID', 'g'),
      providerCookie('.drive.google.com', 'DRIVE', 'd')
    ];
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ success: true });
  });

  it('ignores a failed seed lookup', async () => {
    h.googleError = new Error('no auth');
    const login = await load();
    const pending = login.startProviderLogin('gdrive');
    const window = win();
    await flush();

    expect(h.loggerInfo).not.toHaveBeenCalled();
    expect(window.loadURL).toHaveBeenCalledWith('https://accounts.google.com/');
    window.close();
    await pending;
  });

  it('tolerates cookies rejected by the target session', async () => {
    h.googleCookies = [providerCookie('.google.com', 'REJECT', 'v')];
    h.rejectCookie = /REJECT/;
    const login = await load();
    const pending = login.startProviderLogin('gdrive');
    await flush();
    expect(h.loggerInfo).not.toHaveBeenCalled();

    win().close();
    await pending;
  });
});

describe('token capture', () => {
  it('skips empty token payloads', async () => {
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();

    await vi.advanceTimersByTimeAsync(1000);
    expect(h.setProviderToken).not.toHaveBeenCalled();
    window.close();
    await pending;
  });

  it('skips payloads without an access token', async () => {
    h.jsValue = JSON.stringify({ refresh_token: 'REF' });
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();

    await vi.advanceTimersByTimeAsync(1000);
    expect(h.setProviderToken).not.toHaveBeenCalled();
    window.close();
    await pending;
  });

  it('skips expired access tokens', async () => {
    h.jsValue = JSON.stringify({
      access_token: 'TOK',
      refresh_token: 'REF',
      expires_at: '2000-01-01T00:00:00Z'
    });
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();

    await vi.advanceTimersByTimeAsync(1000);
    expect(h.setProviderToken).not.toHaveBeenCalled();
    window.close();
    await pending;
  });

  it('tolerates executeJavaScript failures', async () => {
    h.jsError = new Error('blocked');
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();

    await vi.advanceTimersByTimeAsync(1000);
    expect(h.setProviderToken).not.toHaveBeenCalled();
    window.close();
    await pending;
  });

  it('captures a valid token without cookies', async () => {
    h.jsValue = JSON.stringify({
      access_token: 'TOK',
      refresh_token: 'REF',
      expires_at: '2099-01-01T00:00:00Z'
    });
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ success: true });
    expect(h.setProviderToken).toHaveBeenCalledWith('pikpak', 'TOK');
    expect(h.setProviderRefresh).toHaveBeenCalledWith('pikpak', 'REF');
    expect(window.destroyed).toBe(true);
  });
});

describe('timeouts and popups', () => {
  it('times out, destroys popups and closes the login window', async () => {
    const login = await load();
    const pending = login.startProviderLogin('gdrive');
    const window = win();
    await flush();

    const popup = new h.FakeBrowserWindow({
      webPreferences: { partition: 'persist:provider-login-gdrive' }
    });
    h.appHandlers['browser-window-created']({}, popup);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    await expect(pending).resolves.toEqual({
      success: false,
      error: 'Przekroczono czas logowania'
    });
    expect(popup.destroyed).toBe(true);
    expect(window.destroyed).toBe(true);
  });

  it('waits for popups after the main window closes, capped by the timeout', async () => {
    const login = await load();
    const pending = login.startProviderLogin('gdrive');
    const window = win();
    await flush();

    const popup = new h.FakeBrowserWindow({
      webPreferences: { partition: 'persist:provider-login-gdrive' }
    });
    h.appHandlers['browser-window-created']({}, popup);
    window.close();

    const result = pending;
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await expect(result).resolves.toEqual({ success: false, canceled: true });
  });

  it('filters popup windows by session and applies the clean user agent', async () => {
    const login = await load();
    const pending = login.startProviderLogin('gdrive');
    const window = win();
    await flush();
    const handler = h.appHandlers['browser-window-created'];

    handler({}, window);
    const other = new h.FakeBrowserWindow({
      webPreferences: { partition: 'persist:other' }
    });
    handler({}, other);
    expect(other.webContents.setUserAgent).not.toHaveBeenCalled();

    const popup = new h.FakeBrowserWindow({
      webPreferences: { partition: 'persist:provider-login-gdrive' }
    });
    handler({}, popup);
    expect(popup.webContents.setUserAgent).toHaveBeenCalled();

    window.close();
    await flush();
    popup.close();
    await pending;
  });

  it('exposes the popup window options', async () => {
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();
    const options = window.webContents.setWindowOpenHandler.mock.calls[0][0]();

    expect(options).toMatchObject({
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          partition: 'persist:provider-login-pikpak',
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      }
    });

    window.close();
    await pending;
  });
});

describe('load and cookie failures', () => {
  it('logs load failures', async () => {
    h.loadError = new Error('boom');
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();
    await flush();

    expect(h.loggerWarn).toHaveBeenCalledWith('providers', 'login window load failed', 'boom');

    window.close();
    await pending;
  });

  it('ignores aborted navigations', async () => {
    h.loadError = new Error('ERR_ABORTED');
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();
    await flush();

    expect(h.loggerWarn).not.toHaveBeenCalled();

    window.close();
    await pending;
  });

  it('reports a failed final cookie read as canceled', async () => {
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();

    h.cookiesError = new Error('cookies');
    await vi.advanceTimersByTimeAsync(1000);
    window.close();

    await expect(pending).resolves.toEqual({ success: false, canceled: true });
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'providers',
      'reading login cookies failed',
      expect.any(Error)
    );
  });

  it('resets stability for unmatched cookies and still cancels', async () => {
    h.cookies.current = [{ domain: 'example.com', name: 'X', value: '1' }];
    const login = await load();
    const pending = login.startProviderLogin('pikpak');
    const window = win();

    await vi.advanceTimersByTimeAsync(1000);
    window.close();
    await expect(pending).resolves.toEqual({ success: false, canceled: true });
  });
});
