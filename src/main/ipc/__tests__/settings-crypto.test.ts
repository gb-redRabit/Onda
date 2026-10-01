import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { safeStorage } from 'electron';
import {
  encryptSecret,
  decryptSecret,
  encryptApiKeys,
  decryptApiKeys,
  encryptionStatus,
  SecretStorageUnavailableError,
  __resetEncryptionStatusCache
} from '../settings-crypto';

// This module is the only place a stored API key can be trusted to, so the
// behaviour that matters is what happens when the platform cannot encrypt:
// the value must not reach disk at all, and the user must find out.

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
    getSelectedStorageBackend: vi.fn()
  }
}));

vi.mock('../../../shared/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
}));

vi.mock('../../warnings', () => ({ recordWarning: vi.fn() }));

const PREFIX = 'onda-enc:v1:';
const PLAIN_PREFIX = 'onda-plain:v1:';

/** basic_text derives its key from a constant: available, but not protection. */
function setPlatform(opts: {
  available: boolean;
  platform?: NodeJS.Platform;
  backend?: string;
  backendThrows?: boolean;
  availableThrows?: boolean;
}) {
  vi.mocked(safeStorage.isEncryptionAvailable).mockImplementation(() => {
    if (opts.availableThrows) throw new Error('boom');
    return opts.available;
  });
  vi.mocked(safeStorage.getSelectedStorageBackend).mockImplementation(() => {
    if (opts.backendThrows) throw new Error('no backend');
    return (opts.backend ?? 'basic_text') as never;
  });
  Object.defineProperty(process, 'platform', {
    value: opts.platform ?? 'win32',
    configurable: true
  });
  __resetEncryptionStatusCache();
}

describe('encryptionStatus', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => __resetEncryptionStatusCache());

  it('is strong on Windows and macOS, where the keychain is always used', () => {
    setPlatform({ available: true, platform: 'win32' });
    expect(encryptionStatus()).toBe('strong');
    setPlatform({ available: true, platform: 'darwin' });
    expect(encryptionStatus()).toBe('strong');
  });

  it('is unavailable when Electron reports no encryption', () => {
    setPlatform({ available: false });
    expect(encryptionStatus()).toBe('unavailable');
  });

  it('is strong on Linux only with a real keyring', () => {
    setPlatform({ available: true, platform: 'linux', backend: 'gnome_libsecret' });
    expect(encryptionStatus()).toBe('strong');
    setPlatform({ available: true, platform: 'linux', backend: 'kwallet6' });
    expect(encryptionStatus()).toBe('strong');
  });

  it('is weak on the Linux basic_text backend, even though it claims to encrypt', () => {
    // This is the case that matters: isEncryptionAvailable() returns true, so a
    // boolean check would report the key as protected when it is not.
    setPlatform({ available: true, platform: 'linux', backend: 'basic_text' });
    expect(encryptionStatus()).toBe('weak');
  });

  it('is unavailable when the platform check itself throws', () => {
    setPlatform({ available: true, availableThrows: true });
    expect(encryptionStatus()).toBe('unavailable');
  });

  it('is unavailable when the Linux backend lookup throws', () => {
    setPlatform({ available: true, platform: 'linux', backendThrows: true });
    expect(encryptionStatus()).toBe('unavailable');
  });

  it('caches the answer, since the platform cannot change mid-process', () => {
    setPlatform({ available: true, platform: 'linux', backend: 'basic_text' });
    expect(encryptionStatus()).toBe('weak');
    setPlatformWithoutReset({ available: true, platform: 'linux', backend: 'gnome_libsecret' });
    expect(encryptionStatus()).toBe('weak');
  });
});

function setPlatformWithoutReset(opts: { available: boolean; platform: string; backend: string }) {
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(opts.available);
  vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue(opts.backend as never);
  Object.defineProperty(process, 'platform', { value: opts.platform, configurable: true });
}

describe('encryptSecret', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => __resetEncryptionStatusCache());

  it('refuses to write a secret when encryption is unavailable', () => {
    setPlatform({ available: false });
    // The old code returned PLAIN_PREFIX + plain here, which put the key in the
    // settings file in the clear and told nobody.
    expect(() => encryptSecret('sk-secret')).toThrow(SecretStorageUnavailableError);
  });

  it('refuses when the Linux backend is too weak to count as protection', () => {
    setPlatform({ available: true, platform: 'linux', backend: 'basic_text' });
    expect(() => encryptSecret('sk-secret')).toThrow(SecretStorageUnavailableError);
  });

  it('refuses when encryptString throws', () => {
    setPlatform({ available: true, platform: 'linux', backend: 'gnome_libsecret' });
    vi.mocked(safeStorage.encryptString).mockImplementation(() => {
      throw new Error('keychain locked');
    });
    expect(() => encryptSecret('sk-secret')).toThrow(SecretStorageUnavailableError);
  });

  it('encrypts and prefixes when a real keyring is present', () => {
    setPlatform({ available: true, platform: 'linux', backend: 'gnome_libsecret' });
    vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('cipher'));
    const stored = encryptSecret('sk-secret');
    expect(stored).toBe(PREFIX + Buffer.from('cipher').toString('base64'));
    expect(stored).not.toContain('sk-secret');
  });

  it('passes an already-encrypted value through untouched', () => {
    setPlatform({ available: false });
    const already = PREFIX + 'abc';
    // A settings save re-sends the value it was given; re-encrypting would
    // double-wrap it.
    expect(encryptSecret(already)).toBe(already);
  });
});

describe('decryptSecret', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => __resetEncryptionStatusCache());

  it('round-trips through the real keyring', () => {
    setPlatform({ available: true, platform: 'win32' });
    vi.mocked(safeStorage.decryptString).mockReturnValue('sk-secret');
    const stored = PREFIX + Buffer.from('cipher').toString('base64');
    expect(decryptSecret(stored)).toBe('sk-secret');
  });

  it('still reads values written by older builds that stored plaintext', () => {
    // Upgrading must not lose a key the user already configured.
    setPlatform({ available: false });
    expect(decryptSecret(PLAIN_PREFIX + 'sk-secret')).toBe('sk-secret');
  });

  it('keeps the stored value when decryption fails, rather than corrupting it', () => {
    // A key encrypted by a different OS keychain cannot be read. Returning the
    // ciphertext is better than returning garbage that the user would then save
    // over their real key.
    setPlatform({ available: true, platform: 'win32' });
    vi.mocked(safeStorage.decryptString).mockImplementation(() => {
      throw new Error('wrong keyring');
    });
    const stored = PREFIX + 'cipher';
    expect(decryptSecret(stored)).toBe(stored);
  });

  it('passes an unprefixed value through', () => {
    setPlatform({ available: true, platform: 'win32' });
    expect(decryptSecret('sk-secret')).toBe('sk-secret');
  });
});

describe('api key collections', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => __resetEncryptionStatusCache());

  const keys = { keys: [{ id: 'a', name: 'YT', service: 'youtube', key: 'sk-1', isActive: true }] };

  it('refuses the whole collection when the platform cannot protect it', () => {
    setPlatform({ available: false });
    expect(() => encryptApiKeys(keys)).toThrow(SecretStorageUnavailableError);
  });

  it('leaves the input untouched so a retry does not double-encrypt', () => {
    setPlatform({ available: true, platform: 'win32' });
    vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from('c'));
    const out = encryptApiKeys(keys);
    expect(keys.keys[0].key).toBe('sk-1');
    expect(out?.keys[0].key).not.toBe('sk-1');
  });

  it('passes undefined through both directions', () => {
    setPlatform({ available: false });
    expect(encryptApiKeys(undefined)).toBeUndefined();
    expect(decryptApiKeys(undefined)).toBeUndefined();
  });

  it('reads a legacy plaintext collection back', () => {
    setPlatform({ available: false });
    const legacy = { keys: [{ ...keys.keys[0], key: PLAIN_PREFIX + 'sk-1' }] };
    expect(decryptApiKeys(legacy)?.keys[0].key).toBe('sk-1');
  });
});
