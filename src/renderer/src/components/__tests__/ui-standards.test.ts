import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Bramka jakości UI (etap A planu 2026-11-02). Nowe pliki nie mogą wprowadzać
// wzorców, które audyt wyeliminował, a istniejące długi mają jawny sufit —
// budżet może tylko maleć. Po migracji obniż `BUDGETS`; nie podnoś go.

const ROOT = join(process.cwd(), 'src/renderer/src');

/** Sufity dla długu, który dopiero będzie migrowany (etapy A3/A4). */
const BUDGETS = {
  arbitraryTextPx: { pattern: /\btext-\[\d+px\]/g, max: 47 },
  blackShadow: { pattern: /\bshadow-black(?:\/\d+)?\b/g, max: 14 },
  blackWhitePalette: {
    pattern: /\b(?:bg|text|border|ring|from|to|via)-(?:black|white)(?:\/\d+)?\b/g,
    max: 72
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

  it('does not grow the arbitrary font-size debt', () => {
    const hits = collect(BUDGETS.arbitraryTextPx.pattern);
    const budget = BUDGETS.arbitraryTextPx.max;
    expect(
      hits.length,
      `Budget ${budget}; use text-2xs/3xs/xs.\n${hits.join('\n')}`
    ).toBeLessThanOrEqual(budget);
  });

  it('does not grow the black shadow debt', () => {
    const hits = collect(BUDGETS.blackShadow.pattern);
    const budget = BUDGETS.blackShadow.max;
    expect(
      hits.length,
      `Budget ${budget}; use shadow-(--shadow-color).\n${hits.join('\n')}`
    ).toBeLessThanOrEqual(budget);
  });

  it('does not grow the black/white palette debt', () => {
    const hits = collect(BUDGETS.blackWhitePalette.pattern);
    const budget = BUDGETS.blackWhitePalette.max;
    expect(
      hits.length,
      `Budget ${budget}; use scrim tokens.\n${hits.join('\n')}`
    ).toBeLessThanOrEqual(budget);
  });
});
