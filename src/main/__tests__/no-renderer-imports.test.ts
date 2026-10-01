import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The main process and the shared layer must not depend on renderer sources:
// that inversion meant main could not be built or tested without the Vue tree.
// This guard fails if an import into `renderer/src` reappears.

const IMPORT_RE = /(?:from\s*|import\s*\(\s*)['"][^'"]*renderer\/src/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|vue)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('layering', () => {
  it('main and shared never import renderer sources', () => {
    const roots = [join(process.cwd(), 'src/main'), join(process.cwd(), 'src/shared')];
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walk(root)) {
        if (IMPORT_RE.test(readFileSync(file, 'utf8'))) {
          offenders.push(file.replace(`${process.cwd()}\\`, '').replace(/\\/g, '/'));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
