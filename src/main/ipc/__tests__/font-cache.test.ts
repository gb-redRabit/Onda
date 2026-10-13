import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Trwały cache czcionek napisów: przed pierwszym zapisem odczyt musi dać miss,
// po zapisie trafienie; zmiana pliku źródłowego unieważnia wpis; budżet dyskowy
// usuwa najstarsze wideo (LRU).

let userData: string | null = '';

vi.mock('electron', () => ({
  app: {
    getPath: () => {
      if (userData === null) throw new Error('app not ready');
      return userData;
    }
  }
}));

const dirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function load(): Promise<typeof import('../font-cache')> {
  vi.resetModules();
  return import('../font-cache');
}

function makeVideo(dir: string, name = 'movie.mkv', size = 1024): string {
  const p = join(dir, name);
  writeFileSync(p, Buffer.alloc(size, 1));
  return p;
}

const FONT_A = { name: 'Roboto', ext: 'ttf', data: [1, 2, 3, 4, 5] };
const FONT_B = { name: 'font', ext: 'ttf', data: [9, 8, 7] };

afterEach(() => {
  userData = '';
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('font cache', () => {
  it('misses before storing and hits after (before/after)', async () => {
    userData = tempDir('onda-fontcache-');
    const video = makeVideo(userData);
    const mod = await load();

    await expect(mod.readCachedFonts(video)).resolves.toBeNull();
    await mod.writeCachedFonts(video, [FONT_A, FONT_B]);
    await expect(mod.readCachedFonts(video)).resolves.toEqual([FONT_A, FONT_B]);
  });

  it('invalidates the entry when the source file changes', async () => {
    userData = tempDir('onda-fontcache-');
    const video = makeVideo(userData, 'movie.mkv', 100);
    const mod = await load();
    await mod.writeCachedFonts(video, [FONT_A]);

    writeFileSync(video, Buffer.alloc(200, 2));
    await expect(mod.readCachedFonts(video)).resolves.toBeNull();
  });

  it('deduplicates identical font bytes while keeping the per-video name', async () => {
    userData = tempDir('onda-fontcache-');
    const v1 = makeVideo(userData, 'a.mkv');
    const v2 = makeVideo(userData, 'b.mkv');
    const mod = await load();
    await mod.writeCachedFonts(v1, [FONT_A]);
    await mod.writeCachedFonts(v2, [{ ...FONT_A, name: 'Other' }]);

    const stats = await mod.fontCacheStats();
    expect(stats.files).toBe(1);
    expect(stats.videos).toBe(2);
    await expect(mod.readCachedFonts(v2)).resolves.toEqual([{ ...FONT_A, name: 'Other' }]);
  });

  it('reports stats and clears the cache', async () => {
    userData = tempDir('onda-fontcache-');
    const video = makeVideo(userData);
    const mod = await load();
    await mod.writeCachedFonts(video, [FONT_A, FONT_B]);

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 2, bytes: 8, videos: 1 });

    const cleared = await mod.clearFontCache();
    expect(cleared).toEqual({ removed: 2, bytesFreed: 8 });
    await expect(mod.readCachedFonts(video)).resolves.toBeNull();
    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 0, bytes: 0, videos: 0 });
  });

  it('evicts the least recently used video when over budget', async () => {
    userData = tempDir('onda-fontcache-');
    const v1 = makeVideo(userData, 'old.mkv');
    const v2 = makeVideo(userData, 'new.mkv');
    const mod = await load();

    await mod.writeCachedFonts(v1, [{ name: 'A', ext: 'ttf', data: Array(100).fill(1) }]);
    await new Promise((r) => setTimeout(r, 5));
    await mod.writeCachedFonts(v2, [{ name: 'B', ext: 'ttf', data: Array(100).fill(2) }], 150);

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 1, bytes: 100, videos: 1 });
    await expect(mod.readCachedFonts(v1)).resolves.toBeNull();
    await expect(mod.readCachedFonts(v2)).resolves.not.toBeNull();
  });

  it('falls back to a tmp directory when Electron is not ready', async () => {
    userData = null;
    const mod = await load();
    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 0, bytes: 0, videos: 0 });
  });
});
