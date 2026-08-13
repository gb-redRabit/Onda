import { vi, describe, it, expect, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  available: true,
  encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`, 'utf-8')),
  decryptString: vi.fn((b: Buffer) => b.toString('utf-8').replace(/^enc:/, ''))
}));

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => m.available,
    encryptString: (s: string) => m.encryptString(s),
    decryptString: (b: Buffer) => m.decryptString(b)
  }
}));

import { encryptSecret, decryptSecret, encryptApiKeys, decryptApiKeys } from '../settings-crypto';

beforeEach(() => {
  m.available = true;
  m.encryptString.mockClear();
  m.decryptString.mockClear();
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret through encryption', () => {
    const enc = encryptSecret('secret123');
    expect(enc).toContain('onda-enc:v1:');
    expect(decryptSecret(enc)).toBe('secret123');
  });

  it('does not double-encrypt an already encrypted value', () => {
    const once = encryptSecret('secret123');
    const twice = encryptSecret(once);
    expect(twice).toBe(once);
  });

  it('returns legacy plaintext values as-is', () => {
    expect(decryptSecret('legacy-plain')).toBe('legacy-plain');
  });

  it('marks plaintext when safeStorage is unavailable', () => {
    m.available = false;
    const enc = encryptSecret('secret123');
    expect(enc).toContain('onda-plain:v1:');
    expect(decryptSecret(enc)).toBe('secret123');
  });
});

describe('encryptApiKeys / decryptApiKeys', () => {
  it('encrypts every key and decrypts them back', () => {
    const keys = {
      keys: [
        { id: '1', name: 'a', service: 'x', key: 'k1', isActive: true },
        { id: '2', name: 'b', service: 'y', key: 'k2', isActive: false }
      ]
    };
    const enc = encryptApiKeys(keys);
    expect(enc?.keys[0]?.key).toContain('onda-enc:v1:');
    const dec = decryptApiKeys(enc);
    expect(dec?.keys[1]?.key).toBe('k2');
  });

  it('handles undefined gracefully', () => {
    expect(encryptApiKeys(undefined)).toBeUndefined();
    expect(decryptApiKeys(undefined)).toBeUndefined();
  });
});
