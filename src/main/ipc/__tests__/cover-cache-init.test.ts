import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// cover-cache.ts used to run a destructive cleanup as an import side effect:
// merely requiring the module deleted files from disk. It now exports an
// explicit initCoverCache() that the boot sequence calls once the store is up.

const ROOT = process.cwd();
const coverCache = readFileSync(join(ROOT, 'src/main/ipc/cover/cover-cache.ts'), 'utf8');
const index = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8');

describe('cover cache initialisation', () => {
  it('exposes an explicit initCoverCache and has no import side effect', () => {
    expect(coverCache).toMatch(/export async function initCoverCache\(/);
    // No top-level fire-and-forget async IIFE (the old import-time cleanup).
    expect(coverCache).not.toMatch(/^\(async \(\) => \{/m);
  });

  it('runs initCoverCache from the app boot sequence', () => {
    expect(index).toMatch(/import \{[^}]*initCoverCache[^}]*\} from '\.\/ipc\/cover\/cover-cache'/);
    expect(index).toMatch(/await initCoverCache\(\)/);
  });
});
