import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  creds: {} as Record<string, { cookie?: string; token?: string; refresh?: string }>,
  getStoreFail: false,
  decryptThrows: false,
  encrypt: vi.fn((value: string) => `enc:${value}`),
  decrypt: vi.fn((value: string) => {
    if (state.decryptThrows) throw new Error('keyring');
    return value.replace(/^enc:/, '');
  }),
  storeSet: vi.fn(),
  sessionCookies: [] as Array<{ name: string; value: string; domain?: string }>,
  hasCookies: vi.fn((cookies: Array<{ name: string; value: string; domain?: string }>) => cookies),
  getSessionCookies: vi.fn()
}));

vi.mock('../../cover/cover-cache', () => ({
  getStore: vi.fn(async () => {
    if (state.getStoreFail) throw new Error('no store');
    return {
      get: () => state.creds,
      set: (key: string, value: unknown) => {
        state.creds = value as typeof state.creds;
        state.storeSet(key, value);
      }
    };
  })
}));
vi.mock('../../settings/settings-crypto', () => ({
  encryptSecret: state.encrypt,
  decryptSecret: state.decrypt
}));
vi.mock('../../../youtube/youtube-auth-session', () => ({
  getSessionCookies: state.getSessionCookies
}));
vi.mock('../../../youtube/youtube-auth-cookies', () => ({
  hasSessionCookies: state.hasCookies
}));

import {
  clearProviderCookie,
  getProviderCookie,
  getProviderRefresh,
  getProviderToken,
  hasProviderCookie,
  setProviderCookie,
  setProviderRefresh,
  setProviderToken
} from '../provider-credentials';

function jwt(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp }))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `a.${payload}.c`;
}

beforeEach(() => {
  state.creds = {};
  state.getStoreFail = false;
  state.decryptThrows = false;
  state.encrypt.mockClear();
  state.decrypt.mockClear();
  state.storeSet.mockClear();
  state.sessionCookies = [];
  state.hasCookies.mockClear();
  state.hasCookies.mockImplementation((cookies) => cookies);
  state.getSessionCookies.mockReset();
  state.getSessionCookies.mockImplementation(async () => state.sessionCookies);
});

describe('cookie storage', () => {
  it('encrypts, stores and decrypts a cookie', async () => {
    expect(await setProviderCookie('115', 'sid=abc')).toBe(true);

    expect(state.encrypt).toHaveBeenCalledWith('sid=abc');
    expect(state.storeSet).toHaveBeenCalledWith('providerCredentials', {
      '115': { cookie: 'enc:sid=abc' }
    });
    expect(await getProviderCookie('115')).toBe('sid=abc');
    expect(await hasProviderCookie('115')).toBe(true);
  });

  it('caps very long values before encryption', async () => {
    await setProviderCookie('115', 'x'.repeat(9000));
    expect(state.encrypt).toHaveBeenCalledWith('x'.repeat(8192));
  });

  it('treats non-string values as empty', async () => {
    await setProviderToken('pikpak', 42 as unknown as string);
    expect(state.encrypt).toHaveBeenCalledWith('');
  });

  it('preserves other fields of the same provider', async () => {
    state.creds = { pikpak: { token: 'enc:token-a' } };

    await setProviderCookie('pikpak', 'c');

    expect(state.creds.pikpak).toEqual({ token: 'enc:token-a', cookie: 'enc:c' });
  });

  it('returns the raw value when decryption fails', async () => {
    state.creds = { '115': { cookie: 'enc:broken' } };
    state.decryptThrows = true;

    expect(await getProviderCookie('115')).toBe('enc:broken');
  });

  it('returns an empty cookie when nothing is stored', async () => {
    expect(await getProviderCookie('115')).toBe('');
  });
});

describe('tokens', () => {
  it('returns a valid JWT and hides an expired one', async () => {
    const valid = jwt(Math.floor(Date.now() / 1000) + 60);
    state.creds = { pikpak: { token: `enc:${valid}` } };

    expect(await getProviderToken('pikpak')).toBe(valid);
    expect(await hasProviderCookie('pikpak')).toBe(true);

    const expired = jwt(Math.floor(Date.now() / 1000) - 60);
    state.creds = { pikpak: { token: `enc:${expired}` } };
    expect(await getProviderToken('pikpak')).toBe('');
    expect(await hasProviderCookie('pikpak')).toBe(false);
  });

  it('returns opaque tokens unchanged', async () => {
    state.creds = { pikpak: { token: 'enc:opaque' } };
    expect(await getProviderToken('pikpak')).toBe('opaque');
  });

  it('returns empty without a token', async () => {
    expect(await getProviderToken('pikpak')).toBe('');
  });
});

describe('refresh tokens', () => {
  it('stores and reads a refresh token', async () => {
    expect(await setProviderRefresh('pikpak', 'refresh-1')).toBe(true);
    expect(state.creds.pikpak).toEqual({ refresh: 'enc:refresh-1' });
    expect(await getProviderRefresh('pikpak')).toBe('refresh-1');
  });

  it('returns empty without one', async () => {
    expect(await getProviderRefresh('pikpak')).toBe('');
  });
});

describe('Google Drive fallback', () => {
  it('builds a cookie string from the Google session', async () => {
    state.sessionCookies = [
      { name: 'SID', value: 'v1', domain: '.google.com' },
      { name: 'DRIVE', value: 'v2', domain: 'drive.google.com' },
      { name: 'OTHER', value: 'v3', domain: 'evil.com' }
    ];

    expect(await getProviderCookie('gdrive')).toBe('SID=v1; DRIVE=v2');
    expect(state.hasCookies).toHaveBeenCalledWith(state.sessionCookies, 'google.com');
    expect(await hasProviderCookie('gdrive')).toBe(true);
  });

  it('returns empty without a Google session', async () => {
    state.hasCookies.mockReturnValue([]);
    expect(await getProviderCookie('gdrive')).toBe('');
    expect(await hasProviderCookie('gdrive')).toBe(false);
  });

  it('treats session errors as no session', async () => {
    state.getSessionCookies.mockRejectedValue(new Error('ipc'));
    expect(await getProviderCookie('gdrive')).toBe('');
    expect(await hasProviderCookie('gdrive')).toBe(false);
  });

  it('reports false for an unrelated provider without credentials', async () => {
    expect(await hasProviderCookie('115')).toBe(false);
  });
});

describe('clearing', () => {
  it('removes every field of the provider', async () => {
    state.creds = { '115': { cookie: 'enc:c' }, other: { cookie: 'enc:o' } };

    expect(await clearProviderCookie('115')).toBe(true);
    expect(state.creds).toEqual({ other: { cookie: 'enc:o' } });
    expect(await getProviderCookie('115')).toBe('');
  });
});

describe('store failures', () => {
  it('reports failures and reads empty values', async () => {
    state.getStoreFail = true;

    expect(await setProviderCookie('115', 'c')).toBe(false);
    expect(await setProviderToken('115', 't')).toBe(false);
    expect(await setProviderRefresh('115', 'r')).toBe(false);
    expect(await clearProviderCookie('115')).toBe(false);
    expect(await getProviderCookie('115')).toBe('');
    expect(await getProviderToken('115')).toBe('');
    expect(await getProviderRefresh('115')).toBe('');
    expect(await hasProviderCookie('115')).toBe(false);
  });
});
