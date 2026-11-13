import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getStore: vi.fn(),
  warn: vi.fn()
}));

vi.mock('../../ipc/cover/cover-cache', () => ({ getStore: h.getStore }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));

import { getAuthSettings, setAuthSettings } from '../youtube-auth-settings';

const defaults = {
  method: 'none',
  cookiesPath: '',
  cookiesBrowser: 'chrome',
  lastLogin: null
};

let store: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

beforeEach(() => {
  store = { get: vi.fn(), set: vi.fn() };
  h.getStore.mockReset().mockResolvedValue(store);
  h.warn.mockClear();
});

describe('getAuthSettings', () => {
  it('returns defaults for missing data', async () => {
    await expect(getAuthSettings()).resolves.toEqual(defaults);
    expect(store.get).toHaveBeenCalledWith('youtube');
  });

  it('reads every persisted field', async () => {
    store.get.mockReturnValue({
      method: 'browser',
      cookiesPath: 'D:/cookies.txt',
      cookiesBrowser: 'firefox',
      lastLogin: 123
    });

    await expect(getAuthSettings()).resolves.toEqual({
      method: 'browser',
      cookiesPath: 'D:/cookies.txt',
      cookiesBrowser: 'firefox',
      lastLogin: 123
    });
  });

  it('rejects an unknown auth method and wrong field types', async () => {
    store.get.mockReturnValue({
      method: 'oauth',
      cookiesPath: 5,
      cookiesBrowser: null,
      lastLogin: 'now'
    });

    await expect(getAuthSettings()).resolves.toEqual(defaults);
  });

  it('accepts the electron and manual methods', async () => {
    store.get.mockReturnValue({ method: 'electron' });
    await expect(getAuthSettings()).resolves.toMatchObject({ method: 'electron' });

    store.get.mockReturnValue({ method: 'manual' });
    await expect(getAuthSettings()).resolves.toMatchObject({ method: 'manual' });
  });

  it('logs and returns defaults when the store fails', async () => {
    const error = new Error('store down');
    h.getStore.mockRejectedValue(error);

    await expect(getAuthSettings()).resolves.toEqual(defaults);
    expect(h.warn).toHaveBeenCalledWith('ytauth', 'getAuthSettings failed', error);
  });
});

describe('setAuthSettings', () => {
  it('merges the patch over the current settings', async () => {
    store.get.mockReturnValue({ method: 'manual', cookiesPath: '/old', lastLogin: 1 });

    await setAuthSettings({ cookiesPath: '/new' });

    expect(store.set).toHaveBeenCalledWith('youtube', {
      method: 'manual',
      cookiesPath: '/new',
      cookiesBrowser: 'chrome',
      lastLogin: 1
    });
  });

  it('logs and swallows store failures', async () => {
    const error = new Error('store down');
    h.getStore.mockRejectedValue(error);

    await expect(setAuthSettings({ method: 'none' })).resolves.toBeUndefined();
    expect(h.warn).toHaveBeenCalledWith('ytauth', 'setAuthSettings failed', error);
  });
});
