#!/usr/bin/env node
// Kończy się niepowodzeniem, gdy zestaw testów pozostawił pliki w drzewie roboczym.
//
// Test, który zapisuje przez ścieżkę względną — zazwyczaj `process.env.TEMP ??
// '.'`, którego fallback rozwiązuje się tylko na Windows — upuszcza plik w katalogu
// głównym repo. Lokalnie nic tego nie zauważa, bo Windows ma ustawiony TEMP; na Linuksie i macOS
// artefakt się pojawia i NASTĘPNY krok CI kończy się niepowodzeniem z mylącym
// ostrzeżeniem `prettier --check` o pliku, którego nikt nie napisał ręcznie.
//
// Czyli: cokolwiek wyprodukowały testy, drzewo musi pozostać niezmienione.

import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let out = '';
try {
  out = execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
} catch {
  console.log('check:artifacts — no git available, skipped');
  process.exit(0);
}

/**
 * Tylko ścieżki, które mógł wyprodukować test:
 *  - `??` — nowy nieśledzony plik
 *  - brudna kolumna WORKTREE — śledzony plik zmodyfikowany na dysku
 *
 * Wpis wyłącznie staged (`M `) to praca własna dewelopera, a nie wynik testu,
 * więc jest ignorowany. Dzięki temu sprawdzenie jest użyteczne lokalnie, a jednocześnie
 * dokładne w CI, gdzie checkout jest czysty od początku.
 */
const artifacts = out
  .split('\n')
  .filter(Boolean)
  .filter((line) => line.startsWith('??') || line[1] !== ' ');

if (!artifacts.length) {
  console.log('check:artifacts — OK (no test artifacts in the working tree)');
  process.exit(0);
}

console.error('check:artifacts — FAILED, the tests wrote into the repository:');
for (const line of artifacts) console.error(`  ${line}`);
console.error(
  '\nIf a test produced this, it is writing into the repository. Use ' +
    'os.tmpdir() for a scratch directory — process.env.TEMP is set on Windows ' +
    'only, so a fallback of "." leaks a file on every Linux and macOS runner.'
);
process.exit(1);
