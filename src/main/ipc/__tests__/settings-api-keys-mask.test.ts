import { describe, it, expect } from 'vitest';
import { maskApiKeys, mergeApiKeys } from '../settings/settings-crypto';
import type { ApiKeySettings } from '../../../shared/types/settings';

// Sekrety nie mogą opuszczać procesu main: `settings:get` zwraca tylko `preview`,
// a zapis z renderera (pusty `key`) zachowuje zapisaną wartość.
// Użyto prefiksu `onda-plain:v1:` (ścieżka starszych buildów), więc `decryptSecret`
// działa bez mockowania safeStorage.

const plain = (v: string) => `onda-plain:v1:${v}`;

describe('maskApiKeys', () => {
  it('strips the secret and exposes only a short preview', () => {
    const stored: ApiKeySettings = {
      keys: [
        { id: 'a', name: 'A', service: 'generic', key: plain('sk-abcdef123456'), isActive: true }
      ]
    };
    const masked = maskApiKeys(stored)!;
    expect(masked.keys[0].key).toBe('');
    expect(masked.keys[0].preview).toBe('sk-a…');
    expect(JSON.stringify(masked)).not.toContain('abcdef123456');
  });

  it('handles an empty key', () => {
    const stored: ApiKeySettings = {
      keys: [{ id: 'a', name: 'A', service: 'generic', key: '', isActive: true }]
    };
    expect(maskApiKeys(stored)!.keys[0].preview).toBe('');
  });
});

describe('mergeApiKeys', () => {
  it('keeps the stored secret when the incoming key is empty', () => {
    const stored: ApiKeySettings = {
      keys: [
        { id: 'a', name: 'A', service: 'generic', key: plain('stored-secret'), isActive: true }
      ]
    };
    const incoming: ApiKeySettings = {
      keys: [{ id: 'a', name: 'A renamed', service: 'generic', key: '', isActive: false }]
    };
    const merged = mergeApiKeys(incoming, stored)!;
    expect(merged.keys[0].key).toBe(plain('stored-secret'));
    expect(merged.keys[0].name).toBe('A renamed');
    expect(merged.keys[0].isActive).toBe(false);
    // `preview` nie jest utrwalany.
    expect('preview' in merged.keys[0]).toBe(false);
  });

  it('uses the new value when provided, and leaves unknown ids empty', () => {
    const incoming: ApiKeySettings = {
      keys: [
        { id: 'new', name: 'N', service: 'generic', key: plain('fresh'), isActive: true },
        { id: 'gone', name: 'G', service: 'generic', key: '', isActive: true }
      ]
    };
    const merged = mergeApiKeys(incoming, { keys: [] })!;
    expect(merged.keys[0].key).toBe(plain('fresh'));
    expect(merged.keys[1].key).toBe('');
  });
});
