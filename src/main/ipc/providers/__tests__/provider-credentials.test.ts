import { describe, it, expect, vi, beforeEach } from 'vitest';

// Poświadczenia providerów: token (JWT) wygasły NIE jest zwracany ani pokazywany jako „ustawiony".

const state = vi.hoisted(() => ({
  creds: {} as Record<string, { token?: string; cookie?: string }>
}));

vi.mock('../../cover/cover-cache', () => ({
  getStore: vi.fn(async () => ({ get: () => state.creds }))
}));
vi.mock('../../settings/settings-crypto', () => ({
  decryptSecret: (v: string) => v,
  encryptSecret: (v: string) => v
}));
vi.mock('../../../youtube/youtube-auth-session', () => ({
  getSessionCookies: vi.fn(async () => [])
}));
vi.mock('../../../youtube/youtube-auth-cookies', () => ({ hasSessionCookies: vi.fn(() => []) }));

import { getProviderToken, hasProviderCookie } from '../provider-credentials';

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
});

describe('provider-credentials — token (JWT exp)', () => {
  it('zwraca ważny token', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    state.creds = { pikpak: { token: jwt(future) } };
    expect(await getProviderToken('pikpak')).toBe(jwt(future));
    expect(await hasProviderCookie('pikpak')).toBe(true);
  });

  it('pomija wygasły token', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    state.creds = { pikpak: { token: jwt(past) } };
    expect(await getProviderToken('pikpak')).toBe('');
    expect(await hasProviderCookie('pikpak')).toBe(false);
  });

  it('zwraca nie-JWT token bez zmian', async () => {
    state.creds = { pikpak: { token: 'plain-token' } };
    expect(await getProviderToken('pikpak')).toBe('plain-token');
  });
});
