import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// cover-cache.ts uruchamiał niszczące czyszczenie jako efekt uboczny importu:
// samo zaimportowanie modułu usuwało pliki z dysku. Teraz eksportuje
// jawny initCoverCache(), który sekwencja startowa wywołuje po uruchomieniu store'a.

const ROOT = process.cwd();
const coverCache = readFileSync(join(ROOT, 'src/main/ipc/cover/cover-cache.ts'), 'utf8');
const index = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8');

describe('cover cache initialisation', () => {
  it('exposes an explicit initCoverCache and has no import side effect', () => {
    expect(coverCache).toMatch(/export async function initCoverCache\(/);
    // Brak najwyższego poziomu fire-and-forget async IIFE (stare czyszczenie w czasie importu).
    expect(coverCache).not.toMatch(/^\(async \(\) => \{/m);
  });

  it('runs initCoverCache from the app boot sequence', () => {
    expect(index).toMatch(/import \{[^}]*initCoverCache[^}]*\} from '\.\/ipc\/cover\/cover-cache'/);
    expect(index).toMatch(/await initCoverCache\(\)/);
  });
});
