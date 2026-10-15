import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Trwały cache providerów — folder listingi (na stałe) i URL plików (TTL).
// `electron` zamockowany na katalog tymczasowy, żeby cache był aktywny bez realnego Electrona.

const dir = mkdtempSync(join(tmpdir(), 'onda-pcache-'));
vi.mock('electron', () => ({ app: { getPath: () => dir } }));

import {
  __resetProviderCache,
  getCachedFileUrl,
  getCachedFolder,
  setCachedFileUrl,
  setCachedFolder
} from '../provider-cache';

beforeEach(() => __resetProviderCache());

describe('provider-cache — foldery', () => {
  it('zapisuje i zwraca listing folderu; nieznany klucz = null', async () => {
    await setCachedFolder('pikpak:SHARE:folder-1', [{ id: 'f1', name: 'a.mp4', kind: 'file' }]);
    expect(await getCachedFolder('pikpak:SHARE:folder-1')).toEqual([
      { id: 'f1', name: 'a.mp4', kind: 'file' }
    ]);
    expect(await getCachedFolder('pikpak:SHARE:folder-2')).toBeNull();
  });

  it('ogranicza liczbę folderów do 300 (LRU — najstarszy wypada)', async () => {
    for (let i = 0; i < 305; i++) await setCachedFolder(`f${i}`, []);
    expect(await getCachedFolder('f0')).toBeNull();
    expect(await getCachedFolder('f304')).toEqual([]);
  });
});

describe('provider-cache — URL plików (TTL)', () => {
  it('zapisuje i zwraca URL z nagłówkami', async () => {
    await setCachedFileUrl('pikpak:SHARE:item-1', 'https://cdn/x', { Referer: 'https://x/' });
    expect(await getCachedFileUrl('pikpak:SHARE:item-1')).toEqual({
      url: 'https://cdn/x',
      headers: { Referer: 'https://x/' }
    });
    expect(await getCachedFileUrl('pikpak:SHARE:nope')).toBeNull();
  });

  it('wygasa po TTL (10 min)', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    await setCachedFileUrl('pikpak:SHARE:item-ttl', 'https://cdn/y');
    expect(await getCachedFileUrl('pikpak:SHARE:item-ttl')).toEqual({ url: 'https://cdn/y' });
    nowSpy.mockReturnValue(1_000_000 + 11 * 60 * 1000);
    expect(await getCachedFileUrl('pikpak:SHARE:item-ttl')).toBeNull();
    nowSpy.mockRestore();
  });
});
