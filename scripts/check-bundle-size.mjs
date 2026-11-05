import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Budżet bundla: pilnuje, żeby nowe zależności/assety nie rozdęły instalatora
// po cichu. Limity są celowo z zapasem względem obecnego stanu (2026-11-05):
// renderer ~8.57 MB, main ~0.84 MB, preload ~0.02 MB.

const LIMITS = {
  rendererTotal: 12 * 1024 * 1024,
  rendererSingle: 4 * 1024 * 1024,
  main: 1.5 * 1024 * 1024,
  preload: 128 * 1024
};

const failures = [];

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push({ path: full, size: (await stat(full)).size });
  }
  return out;
}

function check(label, size, limit) {
  if (size > limit) {
    failures.push(
      `${label}: ${(size / 1024 / 1024).toFixed(2)} MB > ${(limit / 1024 / 1024).toFixed(2)} MB`
    );
  }
}

const rendererFiles = await walk('out/renderer/assets');
if (rendererFiles.length === 0) {
  console.error('check:bundle-size — brak out/renderer/assets; uruchom najpierw npm run build.');
  process.exit(1);
}

const rendererTotal = rendererFiles.reduce((sum, file) => sum + file.size, 0);
check('renderer total', rendererTotal, LIMITS.rendererTotal);
for (const file of rendererFiles) check(`asset ${file.path}`, file.size, LIMITS.rendererSingle);

for (const [label, path, limit] of [
  ['main', 'out/main/index.js', LIMITS.main],
  ['preload', 'out/preload/index.js', LIMITS.preload]
]) {
  try {
    check(label, (await stat(path)).size, limit);
  } catch {
    failures.push(`${label}: brak ${path}`);
  }
}

const largest = [...rendererFiles].sort((a, b) => b.size - a.size)[0];
console.log(
  `check:bundle-size — renderer ${(rendererTotal / 1024 / 1024).toFixed(2)} MB / ${rendererFiles.length} plików` +
    (largest ? `, największy ${(largest.size / 1024 / 1024).toFixed(2)} MB` : '')
);

if (failures.length > 0) {
  console.error('check:bundle-size — przekroczono budżet:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('check:bundle-size — OK');
