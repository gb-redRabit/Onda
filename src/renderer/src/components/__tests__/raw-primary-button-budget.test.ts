import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// D6/K7: nowy przycisk w kolorze akcentu powinien powstawać z `ui/Button`
// (wariant `solid`), a nie z surowego `bg-primary` w klasach. Migracja 121
// istniejących przycisków jest nieopłacalna, więc pilnujemy liczby: budżet może
// tylko maleć. Gdy przeniesiesz przyciski na `ui/Button`, obniż `BUDGET`.

const BUDGET = 121;
const ROOT = join(process.cwd(), 'src/renderer/src');

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

/** Przyciski z surowym `bg-primary` w tagu otwierającym (statycznie lub w `:class`). */
function countRawPrimaryButtons(file: string): number {
  const source = readFileSync(file, 'utf8');
  // `bg-primary/10` i `bg-primary-content` to akcenty i tekst, nie pełne tło przycisku.
  return (source.match(/<button\b[^>]*\bbg-primary(?![-/\w])/g) ?? []).length;
}

describe('raw bg-primary buttons', () => {
  it(`stays within the ${BUDGET}-button budget`, () => {
    const offenders: string[] = [];
    let total = 0;
    for (const file of vueFiles(ROOT)) {
      const count = countRawPrimaryButtons(file);
      if (count === 0) continue;
      total += count;
      offenders.push(`${file.slice(ROOT.length + 1).replace(/\\/g, '/')}: ${count}`);
    }

    expect(
      total,
      `Raw bg-primary buttons found (budget ${BUDGET}). Use ui/Button instead:\n${offenders
        .sort()
        .join('\n')}`
    ).toBeLessThanOrEqual(BUDGET);
  });
});
