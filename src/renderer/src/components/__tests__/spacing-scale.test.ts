import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// K10: jedna skala odstępów. Dozwolone są tylko kroki z listy — reszta (14, 22,
// 28, 36, 44 px) rozjeżdżała rytm między widokami. Nową wartość dodajemy do
// listy świadomie, a nie „bo akurat tyle wyglądało dobrze”.

const ALLOWED = new Set([
  '0',
  '0.5',
  '1',
  '1.5',
  '2',
  '2.5',
  '3',
  '4',
  '5',
  '6',
  '8',
  '10',
  '12',
  '16'
]);

const PREFIXES = [
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'gap',
  'gap-x',
  'gap-y',
  'space-x',
  'space-y'
];

const STEP_RE = new RegExp(`(?<![\\w-])(?:${PREFIXES.join('|')})-(\\d+(?:\\.\\d+)?)\\b`, 'g');

const ROOT = join(process.cwd(), 'src/renderer/src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.vue') || entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('spacing scale', () => {
  it('uses only steps from the shared scale', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Komentarze i dokumentacja mogą cytować dowolne klasy.
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        for (const match of line.matchAll(STEP_RE)) {
          if (ALLOWED.has(match[1])) continue;
          offenders.push(
            `${file.slice(ROOT.length + 1).replace(/\\/g, '/')}:${index + 1} ${match[0]}`
          );
        }
      });
    }

    expect(offenders, 'Off-scale spacing utilities (see K10 in the UI plan)').toEqual([]);
  });
});
