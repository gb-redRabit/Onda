import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadProviderDownloaded, markProviderDownloaded } from '../providers-downloaded-store';

// Siatka regresyjna trwałego magazynu „✓ pobrano" providerów (JSON).

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-prov-dl-'));
  file = join(dir, 'providers-downloaded.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('providers-downloaded-store', () => {
  it('returns an empty list when nothing is stored', async () => {
    await expect(loadProviderDownloaded(file, 'pikpak', 'SHARE1')).resolves.toEqual([]);
  });

  it('marks and loads items for a provider + share', async () => {
    await markProviderDownloaded(file, 'pikpak', 'SHARE1', ['f1', 'f2']);
    await expect(loadProviderDownloaded(file, 'pikpak', 'SHARE1')).resolves.toEqual(['f1', 'f2']);
    // Inny share nie jest zanieczyszczony.
    await expect(loadProviderDownloaded(file, 'pikpak', 'SHARE2')).resolves.toEqual([]);
  });

  it('deduplicates and appends across calls', async () => {
    await markProviderDownloaded(file, 'mega', 'S', ['a', 'b']);
    await markProviderDownloaded(file, 'mega', 'S', ['b', 'c']);
    await expect(loadProviderDownloaded(file, 'mega', 'S')).resolves.toEqual(['a', 'b', 'c']);
  });

  it('ignores empty inputs', async () => {
    await expect(markProviderDownloaded(file, 'pikpak', 'S', [])).resolves.toEqual([]);
    await expect(markProviderDownloaded(file, '', 'S', ['x'])).resolves.toEqual([]);
  });

  it('serializes concurrent writes so no mark is lost', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `i${i}`);
    await Promise.all(ids.map((id) => markProviderDownloaded(file, 'drive', 'S', [id])));
    const list = await loadProviderDownloaded(file, 'drive', 'S');
    expect(list).toHaveLength(20);
  });
});
