// Wykrywa naprawdę puste bloki `catch {}` oraz puste handlery promise
// `.catch(() => {})`. Komentarz wewnątrz bloku jest traktowany jako świadoma
// decyzja "best-effort, celowo zignorowane" i jest dozwolony — przez to, że
// przestaje pasować do wzorca `{ }`.
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const ROOT = 'src';
const CHECKED_EXT = ['.ts', '.vue'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'out', '__tests__']);

const EMPTY_BLOCK_CATCH = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;
const EMPTY_PROMISE_CATCH = /\.catch\(\s*(\([^)]*\))?\s*=>\s*\{\s*\}\s*\)/g;

/** @type {{ file: string, line: number, kind: string }[]} */
const offenders = [];

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
    const report = (match, kind) => {
      const line = content.slice(0, match.index ?? 0).split('\n').length;
      offenders.push({ file: path.replace(/\\/g, '/'), line, kind });
    };
    for (const match of content.matchAll(EMPTY_BLOCK_CATCH)) report(match, 'catch {}');
    for (const match of content.matchAll(EMPTY_PROMISE_CATCH)) report(match, '.catch(() => {})');
  }
}

await walk(ROOT);

if (offenders.length === 0) {
  console.log('check:catch — OK (no empty catch blocks)');
  process.exit(0);
}

console.error(`check:catch — ${offenders.length} empty catch block(s):`);
for (const { file, line, kind } of offenders) console.error(`  ${file}:${line}  ${kind}`);
console.error('\nAdd a log call (logger.warn/debug) or a comment explaining why it is ignored.');
process.exit(1);
