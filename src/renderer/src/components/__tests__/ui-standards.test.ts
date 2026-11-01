import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Bramka jakości UI (etap A planu 2026-11-02). Nowe pliki nie mogą wprowadzać
// wzorców, które audyt wyeliminował: typografia i kolory nakładek mają własne
// tokeny, buttony jawny `type`, a obwódka fokusu `focus-visible`.

const ROOT = join(process.cwd(), 'src/renderer/src');

/** Wzorce, których nie wolno używać (licznik musi być 0). */
const FORBIDDEN_PATTERNS = {
  arbitraryTextPx: { pattern: /\btext-\[\d+px\]/g, hint: 'Use text-4xs/3xs/2xs/xs/ui' },
  blackWhitePalette: {
    pattern: /\b(?:bg|text|border|ring|from|to|via)-(?:black|white)(?:\/\d+)?\b/g,
    hint: 'Use bg-scrim/N, bg-canvas, text-scrim-contrast'
  },
  blackShadow: {
    pattern: /\bshadow-black(?:\/\d+)?\b/g,
    hint: 'Use shadow-scrim/N'
  }
};

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...vueFiles(full));
    } else if (entry.name.endsWith('.vue')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Koniec tagu otwierającego, z pomijaniem `>` wewnątrz wartości atrybutów
 * (`v-if="items.length > 0"` psuło naiwny regex).
 */
function tagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

function tags(source: string, name: string): Array<{ tag: string; line: number }> {
  const found: Array<{ tag: string; line: number }> = [];
  for (let i = source.indexOf(`<${name}`); i !== -1; i = source.indexOf(`<${name}`, i + 1)) {
    const next = source[i + name.length + 1];
    if (next && /[A-Za-z0-9-]/.test(next)) continue;
    const end = tagEnd(source, i);
    if (end === -1) continue;
    found.push({ tag: source.slice(i, end + 1), line: source.slice(0, i).split('\n').length });
  }
  return found;
}

const files = vueFiles(ROOT);

function eachTag(name: string, predicate: (tag: string) => boolean): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { tag, line } of tags(source, name)) {
      if (!predicate(tag)) continue;
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      hits.push(`${rel}:${line} ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
    }
  }
  return hits;
}

function collect(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      hits.push(`${rel}:${line} ${match[0].slice(0, 60)}`);
    }
  }
  return hits;
}

describe('UI standards', () => {
  it('every <button> declares its type', () => {
    const hits = eachTag('button', (tag) => !/\s:?type=/.test(tag));
    expect(hits, 'Use type="button" (or type="submit")').toEqual([]);
  });

  it('focus rings on controls use focus-visible, not focus', () => {
    const hits = ['button', 'select', 'a'].flatMap((name) =>
      eachTag(
        name,
        (tag) => /(?<!-)focus:(?:ring|border|outline)/.test(tag) && !/focus-visible:/.test(tag)
      )
    );
    expect(hits, 'Use focus-visible: for buttons/selects/links').toEqual([]);
  });

  it.each(Object.entries(FORBIDDEN_PATTERNS))('%s is not used', (name, rule) => {
    expect(collect(rule.pattern), `${name}: ${rule.hint}`).toEqual([]);
  });
});
