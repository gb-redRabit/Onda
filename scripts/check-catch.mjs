// Flags truly empty `catch {}` blocks. A comment inside the block is treated as
// a conscious "best-effort, intentionally ignored" decision and is allowed.
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const ROOT = 'src';
const CHECKED_EXT = ['.ts', '.vue'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'out', '__tests__']);

const EMPTY_CATCH = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;

/** @type {{ file: string, line: number }[]} */
const offenders = [];

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name));
      continue;
    }
    if (!CHECKED_EXT.some((ext) => entry.name.endsWith(ext))) continue;
    if (entry.name.endsWith('.test.ts')) continue;

    const path = join(dir, entry.name);
    const content = await readFile(path, 'utf-8');
    for (const match of content.matchAll(EMPTY_CATCH)) {
      const line = content.slice(0, match.index ?? 0).split('\n').length;
      offenders.push({ file: path.replace(/\\/g, '/'), line });
    }
  }
}

await walk(ROOT);

if (offenders.length === 0) {
  console.log('check:catch — OK (no empty catch blocks)');
  process.exit(0);
}

console.error(`check:catch — ${offenders.length} empty catch block(s):`);
for (const { file, line } of offenders) console.error(`  ${file}:${line}`);
console.error('\nAdd a log call (logger.warn/debug) or a comment explaining why it is ignored.');
process.exit(1);
