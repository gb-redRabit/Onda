import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, sep } from 'path';
import en from '../en';
import pl from '../pl';

// Audyt użycia i18n. Trzy zabezpieczenia:
//   1. każdy statycznie referowany klucz istnieje w OBU lokalizacjach (brakujące tłumaczenie),
//   2. każdy dynamiczny prefiks (`t(`a.b.${x}`)` / `t('a.b.' + x)`) pasuje do jakiegoś klucza
//      (łapie literówki w samym prefiksie),
//   3. brak martwych kluczy: klucz zdefiniowany w obu lokalizacjach, ale nigdzie nieużywany.
// Martwe klucze to oznaka zaniedbania, a nie błąd — dodaj je do poniższej listy dozwolonych
// z krótkim uzasadnieniem, jeśli muszą zostać (np. zarezerwowane na przyszłą funkcję).

const ALLOWED_DEAD_KEYS: string[] = [];

type Tree = { [key: string]: Tree | unknown };

function isTree(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keyPaths(tree: Tree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isTree(value)) out.push(...keyPaths(value, path));
    else out.push(path);
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|vue)$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = walk(join(process.cwd(), 'src')).filter(
  (file) => !file.includes(`${sep}locales${sep}`) && !file.includes(`${sep}__tests__${sep}`)
);

const enKeys = new Set(keyPaths(en as unknown as Tree));
const plKeys = new Set(keyPaths(pl as unknown as Tree));

const staticRefs = new Set<string>();
const dynamicPrefixes = new Set<string>();

for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  // t('a.b') / tm('a.b') — dwa akcesory używane w całej aplikacji. Literał musi
  // być całym argumentem (`,` lub `)` zaraz po nim), w przeciwnym razie prefiks
  // konkatenacji takiej jak t('a.b.' + x) zostałby zgłoszony jako brakujący klucz.
  for (const m of text.matchAll(/\btm?\(\s*['"`]([A-Za-z0-9_.-]+)['"`]\s*[,)]/g)) {
    staticRefs.add(m[1]);
  }
  // t(`a.b.${x}`) / t('a.b.' + x)
  for (const m of text.matchAll(/\btm?\(\s*`([^`$]*)\$\{/g)) dynamicPrefixes.add(m[1]);
  for (const m of text.matchAll(/\btm?\(\s*['"]([A-Za-z0-9_.-]+)['"]\s*\+/g)) {
    dynamicPrefixes.add(m[1]);
  }
  // Każdy literał łańcuchowy, który jest dokładnie zdefiniowanym kluczem, liczy się jako użyty — obejmuje
  // tabele kluczy (`{ key: 'home.audioFiles' }`, pola labelKey/descKey, …).
  for (const m of text.matchAll(/['"`]([A-Za-z0-9_.-]+)['"`]/g)) {
    if (enKeys.has(m[1])) staticRefs.add(m[1]);
  }
}

const dotted = [...staticRefs].filter((key) => key.includes('.'));

function dynamicPrefixCovers(key: string): boolean {
  return [...dynamicPrefixes].some((prefix) => prefix.length > 0 && key.startsWith(prefix));
}

const missingInEn = dotted.filter((key) => !enKeys.has(key)).sort();
const missingInPl = dotted.filter((key) => !plKeys.has(key)).sort();
const orphanPrefixes = [...dynamicPrefixes]
  .filter((prefix) => prefix.length > 0 && ![...enKeys].some((key) => key.startsWith(prefix)))
  .sort();
const deadKeys = [...enKeys]
  .filter((key) => !staticRefs.has(key) && !dynamicPrefixCovers(key))
  .filter((key) => !ALLOWED_DEAD_KEYS.includes(key))
  .sort();

describe('i18n usage', () => {
  it('references only keys that exist in both locales', () => {
    expect({ missingInEn, missingInPl }).toEqual({ missingInEn: [], missingInPl: [] });
  });

  it('uses dynamic key prefixes that match at least one key', () => {
    expect(orphanPrefixes).toEqual([]);
  });

  it('has no dead keys', () => {
    expect(deadKeys).toEqual([]);
  });

  it('keeps both locales the same size', () => {
    expect(enKeys.size).toBe(plKeys.size);
  });
});
