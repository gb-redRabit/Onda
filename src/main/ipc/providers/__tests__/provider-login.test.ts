import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Siatka regresyjna okna logowania providerów: filtry domen cookie, składanie
// nagłówka, auto-zamykanie przy wykryciu sesji i gałęzie błędów. `electron`
// (BrowserWindow/session) oraz `provider-credentials`/`pip-icon` zamockowane.

interface CookieLike {
  domain: string;
  name: string;
  value: string;
}

const h = vi.hoisted(() => {
  type Listener = () => void;
  class FakeBrowserWindow {
    opts: Record<string, unknown>;
    listeners = new Map<string, Listener[]>();
    destroyed = false;
    focus = vi.fn();
    show = vi.fn();
    loadURL = vi.fn(async () => {});
    webContents = {
      setWindowOpenHandler: vi.fn(),
      setUserAgent: vi.fn(),
      executeJavaScript: vi.fn(async () => '')
    };
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      h.windows.push(this);
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    once(event: string, cb: Listener): this {
      const list = this.listeners.get(event) ?? [];
      list.push(cb);
      this.listeners.set(event, list);
      return this;
    }
    on(event: string, cb: Listener): this {
      return this.once(event, cb);
    }
    emit(event: string): void {
      for (const cb of this.listeners.get(event) ?? []) cb();
    }
    close(): void {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const windows: FakeBrowserWindow[] = [];
  const state: { cookies: CookieLike[] } = { cookies: [] };
  const session = {
    defaultSession: { getUserAgent: () => 'Mozilla/5.0 Electron/30.0.0 Chrome/126 Safari/537.36' },
    fromPartition: () => ({ cookies: { get: async () => state.cookies } })
  };
  return { windows, FakeBrowserWindow, state, session };
});

vi.mock('electron', () => ({
  BrowserWindow: h.FakeBrowserWindow,
  session: h.session,
  app: { on: vi.fn(), removeListener: vi.fn() }
}));
vi.mock('../../../pip/pip-icon', () => ({ pipWindowIcon: () => '/icon.ico' }));
vi.mock('../provider-credentials', () => ({
  setProviderCookie: vi.fn(async () => true),
  setProviderToken: vi.fn(async () => true),
  setProviderRefresh: vi.fn(async () => true)
}));

import {
  startProviderLogin,
  isProviderLoginSupported,
  listLoginProviderIds
} from '../provider-login';
import { setProviderCookie, setProviderRefresh, setProviderToken } from '../provider-credentials';

const fakeWindow = (): (typeof h.windows)[number] | undefined => h.windows.at(-1);

beforeEach(() => {
  h.windows.length = 0;
  h.state.cookies = [];
  vi.mocked(setProviderCookie).mockClear();
  vi.mocked(setProviderCookie).mockResolvedValue(true);
  vi.mocked(setProviderToken).mockClear();
  vi.mocked(setProviderToken).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  for (const w of h.windows) w.close();
});

describe('LOGIN_META', () => {
  it('supports the expected providers (PikPak + Google Drive)', () => {
    expect(isProviderLoginSupported('gdrive')).toBe(true);
    expect(isProviderLoginSupported('pikpak')).toBe(true);
    expect(isProviderLoginSupported('mega')).toBe(false);
    expect(isProviderLoginSupported('115')).toBe(false);
    expect(listLoginProviderIds()).toEqual(['pikpak', 'gdrive']);
  });
});

describe('startProviderLogin — unsupported', () => {
  it('returns an error and opens no window', async () => {
    const res = await startProviderLogin('mega');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/nieobsługiwane/i);
    expect(h.windows).toHaveLength(0);
  });
});

describe('startProviderLogin — happy path', () => {
  it('collects only matching-domain cookies (rejecting lookalike domains) and stores the header', async () => {
    const promise = startProviderLogin('gdrive');
    const win = fakeWindow();
    expect(win).toBeTruthy();
    expect(win?.opts.backgroundColor).toBe('#0f0f17');
    expect(win?.opts.icon).toBe('/icon.ico');

    h.state.cookies = [
      { domain: '.google.com', name: 'SID', value: 'abc' },
      { domain: '.drive.google.com', name: 'DRIVE', value: 'x1' },
      { domain: 'evilgoogle.com', name: 'SPOOF', value: 'no' },
      { domain: '.evil.com', name: 'BAD', value: 'nope' }
    ];
    win?.emit('closed');

    await expect(promise).resolves.toEqual({ success: true });
    expect(setProviderCookie).toHaveBeenCalledWith('gdrive', 'SID=abc; DRIVE=x1');
  });

  it('auto-closes the window once session cookies stabilize across polls', async () => {
    vi.useFakeTimers();
    const promise = startProviderLogin('gdrive');
    const win = fakeWindow();
    h.state.cookies = [{ domain: '.google.com', name: 'SID', value: 's1' }];

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ success: true });
    expect(win?.isDestroyed()).toBe(true);
    expect(setProviderCookie).toHaveBeenCalledWith('gdrive', 'SID=s1');
  });

  it('reports canceled when no cookie matches the provider domains', async () => {
    const promise = startProviderLogin('gdrive');
    fakeWindow()?.emit('closed');
    await expect(promise).resolves.toEqual({ success: false, canceled: true });
    expect(setProviderCookie).not.toHaveBeenCalled();
  });

  it('reports an error when the cookie store cannot be written', async () => {
    vi.mocked(setProviderCookie).mockResolvedValueOnce(false);
    const promise = startProviderLogin('gdrive');
    h.state.cookies = [{ domain: '.google.com', name: 'A', value: '1' }];
    fakeWindow()?.emit('closed');
    await expect(promise).resolves.toMatchObject({ success: false });
    expect((await promise).error).toBeTruthy();
  });
});

describe('startProviderLogin — single window', () => {
  it('focuses the open window and cancels a second request', async () => {
    const first = startProviderLogin('gdrive');
    const win = fakeWindow();
    const second = await startProviderLogin('gdrive');
    expect(second).toMatchObject({ success: false, canceled: true });
    expect(win?.focus).toHaveBeenCalled();
    expect(h.windows).toHaveLength(1);

    win?.emit('closed');
    await first;
  });
});

describe('startProviderLogin — PikPak (token z localStorage)', () => {
  it('przechwytuje access_token i zwraca sukces (bez cookies)', async () => {
    vi.useFakeTimers();
    const promise = startProviderLogin('pikpak');
    const win = fakeWindow();
    win!.webContents.executeJavaScript.mockResolvedValue(
      JSON.stringify({
        access_token: 'TOK',
        refresh_token: 'REF',
        expires_at: '2099-01-01T00:00:00Z'
      })
    );

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ success: true });
    expect(setProviderToken).toHaveBeenCalledWith('pikpak', 'TOK');
    expect(setProviderRefresh).toHaveBeenCalledWith('pikpak', 'REF');
    expect(win?.isDestroyed()).toBe(true);
  });
});
