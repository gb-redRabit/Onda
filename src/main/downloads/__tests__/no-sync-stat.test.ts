import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// `statSync` na ścieżce pobierania blokował pętlę zdarzeń Node (całe IPC), gdy
// pobieranie się kończyło. Rozstrzyganie ścieżki wyjściowej musi używać asynchronicznego `stat`.

const SOURCE = readFileSync(join(process.cwd(), 'src/main/downloads/download-attempt.ts'), 'utf8');

describe('download output resolution', () => {
  it('does not use the synchronous statSync', () => {
    expect(SOURCE).not.toMatch(/statSync\(/);
    expect(SOURCE).toMatch(/from 'fs\/promises'/);
  });
});
