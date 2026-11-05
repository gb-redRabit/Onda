import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkSettings } from '../../../../shared/types/settings';

const mocks = vi.hoisted(() => {
  class SecretStorageUnavailableError extends Error {}
  return {
    SecretStorageUnavailableError,
    encryptSecret: vi.fn((value: string) => (value.startsWith('enc:') ? value : `enc:${value}`))
  };
});

vi.mock('../settings-crypto', () => ({
  encryptSecret: mocks.encryptSecret,
  SecretStorageUnavailableError: mocks.SecretStorageUnavailableError
}));

const {
  PROXY_PASSWORD_MASK,
  encryptProxyPasswords,
  maskProxyPasswords,
  restoreProxyPasswords,
  stripProxyPasswords
} = await import('../settings-proxy');

function network(
  overrides: Partial<
    Record<'proxy' | 'proxyYoutube' | 'proxySoundcloud', { password?: string }>
  > = {}
) {
  return {
    proxy: { password: 'global' },
    proxyYoutube: { password: 'youtube' },
    proxySoundcloud: { password: 'soundcloud' },
    ...overrides
  } as NetworkSettings;
}

beforeEach(() => {
  mocks.encryptSecret.mockClear();
});

describe('proxy password handling', () => {
  it('masks every non-empty password sent to the renderer', () => {
    const value = network({ proxySoundcloud: { password: '' } });
    maskProxyPasswords(value);
    expect(value.proxy?.password).toBe(PROXY_PASSWORD_MASK);
    expect(value.proxyYoutube?.password).toBe(PROXY_PASSWORD_MASK);
    expect(value.proxySoundcloud?.password).toBe('');
  });

  it('restores stored passwords for a mask or missing field, but keeps a new one', () => {
    const stored = network();
    const incoming = network({
      proxy: { password: PROXY_PASSWORD_MASK },
      proxyYoutube: {},
      proxySoundcloud: { password: 'new-secret' }
    });
    restoreProxyPasswords(incoming, stored);
    expect(incoming.proxy?.password).toBe('global');
    expect(incoming.proxyYoutube?.password).toBe('youtube');
    expect(incoming.proxySoundcloud?.password).toBe('new-secret');
  });

  it('strips passwords from exports', () => {
    const value = network();
    stripProxyPasswords(value);
    expect(value.proxy?.password).toBeUndefined();
    expect(value.proxyYoutube?.password).toBeUndefined();
    expect(value.proxySoundcloud?.password).toBeUndefined();
  });

  it('encrypts plain passwords, leaves masks and already encrypted values', () => {
    const value = network({
      proxy: { password: 'new' },
      proxyYoutube: { password: PROXY_PASSWORD_MASK },
      proxySoundcloud: { password: 'enc:old' }
    });
    encryptProxyPasswords(value);
    expect(value.proxy?.password).toBe('enc:new');
    expect(value.proxyYoutube?.password).toBe(PROXY_PASSWORD_MASK);
    expect(value.proxySoundcloud?.password).toBe('enc:old');
  });

  it('keeps the password when secure storage is unavailable', () => {
    mocks.encryptSecret.mockImplementationOnce(() => {
      throw new mocks.SecretStorageUnavailableError();
    });
    const value = network({ proxy: { password: 'plain' } });
    expect(() => encryptProxyPasswords(value)).not.toThrow();
    expect(value.proxy?.password).toBe('plain');
  });
});
