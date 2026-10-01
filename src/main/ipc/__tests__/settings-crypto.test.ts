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
} from '../settings/settings-crypto';

// Ten moduł to jedyne miejsce, któremu można zaufać w kwestii zapisanego klucza API, więc
// istotne jest zachowanie, gdy platforma nie potrafi szyfrować:
// wartość nie może w ogóle trafić na dysk, a użytkownik musi się o tym dowiedzieć.

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

/** basic_text wyprowadza klucz ze stałej: dostępne, ale to nie ochrona. */
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
    // To jest ten istotny przypadek: isEncryptionAvailable() zwraca true, więc
    // sprawdzenie boolowskie zgłosiłoby klucz jako chroniony, gdy nie jest.
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
    // Stary kod zwracał tu PLAIN_PREFIX + plain, co umieszczało klucz w
    // pliku ustawień jawnym tekstem i nikogo nie informowało.
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
    // Zapis ustawień ponownie wysyła wartość, którą dostał; ponowne zaszyfrowanie
    // owinęłoby ją podwójnie.
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
    // Aktualizacja nie może zgubić klucza, który użytkownik już skonfigurował.
    setPlatform({ available: false });
    expect(decryptSecret(PLAIN_PREFIX + 'sk-secret')).toBe('sk-secret');
  });

  it('keeps the stored value when decryption fails, rather than corrupting it', () => {
    // Klucza zaszyfrowanego przez inny keychain systemu nie da się odczytać. Zwrócenie
    // szyfrogramu jest lepsze niż zwrócenie śmieci, które użytkownik zapisałby potem
    // nad swoim prawdziwym kluczem.
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
