import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// `app.getPath` can return an empty string, not only throw. `join('', name)` is
// a RELATIVE path, so the cover cache map was written into the process working
// directory — the repository during development, and wherever the user launched
// the app from once packaged. It is now rejected as non-absolute.

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

async function load(): Promise<typeof import('../cover-map')> {
  vi.resetModules();
  return import('../cover-map');
}

function cwdEntry(name: string): boolean {
  return readdirSync(process.cwd()).includes(name);
}

afterEach(() => {
  userData = '';
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  rmSync(join(process.cwd(), 'cover-cache-map.json'), { force: true });
});

describe('cover map path', () => {
  it('uses the profile directory when Electron provides one', async () => {
    const dir = tempDir('onda-covermap-');
    userData = dir;

    const mod = await load();
    await mod.writeCoverMap({ '/a.mp3': { cacheFile: 'x.jpg', mtime: 1 } });

    expect(existsSync(join(dir, 'cover-cache-map.json'))).toBe(true);
  });

  it('never writes a relative path into the working directory', async () => {
    // The bug: an empty userData produced "cover-cache-map.json", which the
    // process then resolved against its cwd.
    userData = '';
    const mod = await load();
    await mod.writeCoverMap({ '/a.mp3': { cacheFile: 'x.jpg', mtime: 1 } });

    expect(cwdEntry('cover-cache-map.json')).toBe(false);
  });

  it('falls back to tmp instead of throwing when Electron is not ready', async () => {
    userData = null;
    const mod = await load();
    await expect(mod.writeCoverMap({})).resolves.toBeUndefined();
  });

  it('rejects a non-absolute profile path', async () => {
    userData = 'relative/profile';
    const mod = await load();
    await mod.writeCoverMap({});
    expect(existsSync(join(process.cwd(), 'relative', 'profile'))).toBe(false);
  });

  it('keeps the map in memory between calls', async () => {
    userData = tempDir('onda-covermap-');

    const mod = await load();
    await mod.writeCoverMap({ '/a.mp3': { cacheFile: 'x.jpg', mtime: 5 } });

    await expect(mod.readCoverMap()).resolves.toEqual({
      '/a.mp3': { cacheFile: 'x.jpg', mtime: 5 }
    });
  });
});
