import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// No <img> in the renderer had an alt attribute. That is not automatically a
// bug: most of them are thumbnails sitting next to the file name as text, and
// the correct answer there is an explicitly empty alt, which is what says "this
// adds nothing for a screen reader" and suppresses the filename a screen reader
// would otherwise read out. A missing attribute is ambiguous, an empty one is
// a decision — so the guard is that none is left unstated.

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

/** Strips comments so an <img> mentioned in prose is not treated as markup. */
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
