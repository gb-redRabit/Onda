import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Synchroniczne operacje fs na ścieżce pobierania blokują pętlę zdarzeń Node (całe
// IPC). Krytyczny przypadek to `copyFileSync` fallbacku cross-device, który kopiuje
// plik do 20 GiB synchronicznie. Ścieżka wyjściowa i transport muszą używać
// asynchronicznego `fs/promises`.

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('download output resolution', () => {
  it('does not use the synchronous statSync', () => {
    const source = read('src/main/downloads/download-attempt.ts');
    expect(source).not.toMatch(/statSync\(/);
    expect(source).toMatch(/from 'fs\/promises'/);
  });
});

describe('http download transport', () => {
  it('uses no synchronous fs calls and imports fs/promises', () => {
    const source = read('src/main/downloads/http-downloader.ts');
    expect(source).not.toMatch(/\b\w+Sync\(/);
    expect(source).toMatch(/from 'fs\/promises'/);
  });
});
