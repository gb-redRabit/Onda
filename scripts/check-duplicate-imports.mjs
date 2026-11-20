#!/usr/bin/env node
// Guard: ten sam moduł importowany więcej niż raz w jednym pliku (np. dwa osobne
// `import ... from './x'`, albo `import` + `import type` z tego samego źródła).
// Takie duplikaty łatwo przeoczyć, a rozjeżdżają się przy refaktorze.
//
// Zastępuje regułę `import/no-duplicates`, której nie da się włączyć bez dodawania
// `eslint-plugin-import`; trzymamy się wzorca lekkich skryptów-guardów (check-catch).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { duplicateSpecifiers } from './lib/duplicate-imports.mjs';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const EXTENSIONS = ['.ts', '.tsx', '.vue'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of walk(SRC)) {
  const dupes = duplicateSpecifiers(readFileSync(file, 'utf8'));
  if (dupes.length) problems.push({ file, dupes });
}

if (problems.length) {
  console.error('check:dupes — znaleziono zduplikowane importy:');
  for (const { file, dupes } of problems) {
    console.error(`  ${relative(ROOT, file)}: ${dupes.join(', ')}`);
  }
  process.exit(1);
}
console.log('check:dupes — OK (brak zduplikowanych importów)');
