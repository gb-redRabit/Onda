import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Żaden <img> w rendererze nie miał atrybutu alt. To nie zawsze jest
// błąd: większość z nich to miniatury obok nazwy pliku jako tekstu, a
// poprawną odpowiedzią jest tam jawnie pusty alt, który mówi "to
// nic nie wnosi dla czytnika ekranu" i tłumi nazwę pliku, którą czytnik ekranu
// w przeciwnym razie by odczytał. Brakujący atrybut jest niejednoznaczny, pusty to
// decyzja — więc zabezpieczeniem jest to, że żaden nie pozostaje nieokreślony.

const SRC = join(process.cwd(), 'src/renderer/src');

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : vueFiles(full);
    return entry.endsWith('.vue') ? [full] : [];
  });
}

const files = vueFiles(SRC);
const rel = (f: string) => f.replace(`${process.cwd()}\\`, '').replace(/\\/g, '/');

/** Usuwa komentarze, żeby <img> wspomniany w prozie nie był traktowany jak znacznik. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('images declare themselves decorative or described', () => {
  it('finds the renderer components it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)('%s: every <img> has an alt', (file) => {
    const source = stripComments(readFileSync(file, 'utf8'));
    const missing: number[] = [];
    for (const match of source.matchAll(/<img\b[^>]*>/g)) {
      if (!/\balt\s*=/.test(match[0])) {
        missing.push(source.slice(0, match.index).split('\n').length);
      }
    }
    expect(missing, `${rel(file)}: <img> without alt on line(s) ${missing.join(', ')}`).toEqual([]);
  });
});
