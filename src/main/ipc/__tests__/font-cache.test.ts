import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

interface StoredIndex {
  fonts: Record<string, { ext: string; size?: number; usedAt?: number }>;
  videos: Record<
    string,
    { stamp: string; fonts: { hash: string; name: string }[]; usedAt: number }
  >;
}

function indexFile(): string {
  return join(userData as string, 'font-cache', 'index.json');
}

function readIndex(): StoredIndex {
  return JSON.parse(readFileSync(indexFile(), 'utf-8')) as StoredIndex;
}

function writeIndex(data: unknown): void {
  mkdirSync(join(userData as string, 'font-cache'), { recursive: true });
  writeFileSync(indexFile(), JSON.stringify(data));
}

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

  it('reads an existing index and tolerates a missing videos section', async () => {
    userData = tempDir('onda-fontcache-');
    writeIndex({ fonts: { dead: { ext: 'ttf' } } });

    const mod = await load();

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 1, bytes: 0, videos: 0 });
  });

  it('tolerates an empty index object', async () => {
    userData = tempDir('onda-fontcache-');
    writeIndex({});

    const mod = await load();

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 0, bytes: 0, videos: 0 });
  });

  it('misses when the video cannot be statted', async () => {
    userData = tempDir('onda-fontcache-');
    const mod = await load();

    await expect(mod.readCachedFonts(join(userData as string, 'missing.mkv'))).resolves.toBeNull();
    await mod.writeCachedFonts(join(userData as string, 'missing.mkv'), [FONT_A]);

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 0, bytes: 0, videos: 0 });
  });

  it('treats an incomplete index entry as a miss', async () => {
    userData = tempDir('onda-fontcache-');
    const video = makeVideo(userData);
    const mod = await load();
    await mod.writeCachedFonts(video, [FONT_A]);

    const idx = readIndex();
    idx.fonts = {};
    writeIndex(idx);

    const reloaded = await load();
    await expect(reloaded.readCachedFonts(video)).resolves.toBeNull();
  });

  it('misses when a cached font file disappeared', async () => {
    userData = tempDir('onda-fontcache-');
    const video = makeVideo(userData);
    const mod = await load();
    await mod.writeCachedFonts(video, [FONT_A]);

    const idx = readIndex();
    const hash = Object.keys(idx.fonts)[0]!;
    rmSync(join(userData as string, 'font-cache', `${hash}.${idx.fonts[hash].ext}`));

    const reloaded = await load();
    await expect(reloaded.readCachedFonts(video)).resolves.toBeNull();
  });

  it('logs an index write failure', async () => {
    userData = tempDir('onda-fontcache-');
    const video = makeVideo(userData);
    const mod = await load();
    mkdirSync(indexFile(), { recursive: true });

    await expect(mod.writeCachedFonts(video, [FONT_A])).resolves.toBeUndefined();

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 1, bytes: 5, videos: 1 });
  });

  it('serializes concurrent index writes', async () => {
    userData = tempDir('onda-fontcache-');
    const v1 = makeVideo(userData, 'a.mkv');
    const v2 = makeVideo(userData, 'b.mkv');
    const mod = await load();

    await Promise.all([mod.writeCachedFonts(v1, [FONT_A]), mod.writeCachedFonts(v2, [FONT_B])]);

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 2, bytes: 8, videos: 2 });
  });

  it('skips unreferenced fonts while evicting a shared video', async () => {
    userData = tempDir('onda-fontcache-');
    const v1 = makeVideo(userData, 'a.mkv');
    const v2 = makeVideo(userData, 'b.mkv');
    const mod = await load();
    const shared = { name: 'Shared', ext: 'ttf', data: Array(5).fill(1) };
    const big = { name: 'Big', ext: 'ttf', data: Array(100).fill(2) };

    await mod.writeCachedFonts(v1, [shared]);
    await new Promise((r) => setTimeout(r, 5));
    await mod.writeCachedFonts(v2, [shared, big], 50);

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 0, bytes: 0, videos: 0 });
  });

  it('skips missing and size-less font entries during eviction', async () => {
    userData = tempDir('onda-fontcache-');
    const video = makeVideo(userData);
    writeIndex({
      fonts: { dead: { ext: 'ttf' } },
      videos: {
        a: { stamp: '0:0', fonts: [{ hash: 'ghost', name: 'g' }], usedAt: 0 },
        b: { stamp: '0:0', fonts: [{ hash: 'dead', name: 'd' }], usedAt: 1 }
      }
    });

    const mod = await load();
    await mod.writeCachedFonts(video, [FONT_A], -1);

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 0, bytes: 0, videos: 0 });
  });

  it('reports and clears size-less font entries', async () => {
    userData = tempDir('onda-fontcache-');
    writeIndex({ fonts: { dead: { ext: 'ttf' } }, videos: {} });

    const mod = await load();

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 1, bytes: 0, videos: 0 });
    await expect(mod.clearFontCache()).resolves.toEqual({ removed: 1, bytesFreed: 0 });
  });

  it('logs fonts that cannot be removed', async () => {
    userData = tempDir('onda-fontcache-');
    const nested = join(userData as string, 'font-cache', 'bad.ttf');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'keep'), 'x');
    writeIndex({ fonts: { bad: { ext: 'ttf', size: 3 } }, videos: {} });

    const mod = await load();

    await expect(mod.clearFontCache()).resolves.toEqual({ removed: 0, bytesFreed: 0 });
  });

  it('logs fonts that cannot be persisted', async () => {
    userData = tempDir('onda-fontcache-');
    const video = makeVideo(userData);
    const hash = createHash('sha1').update(Buffer.from(FONT_A.data)).digest('hex');
    const nested = join(userData as string, 'font-cache', `${hash}.${FONT_A.ext}`);
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'keep'), 'x');

    const mod = await load();
    await mod.writeCachedFonts(video, [FONT_A]);

    await expect(mod.fontCacheStats()).resolves.toEqual({ files: 0, bytes: 0, videos: 1 });
  });
});
