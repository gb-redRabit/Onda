#!/usr/bin/env node
// Fails when the test suite left files behind in the working tree.
//
// A test that writes through a relative path — typically `process.env.TEMP ??
// '.'`, whose fallback only resolves on Windows — drops a file into the repo
// root. Nothing local notices, because Windows has TEMP set; on Linux and macOS
// the artifact appears and the NEXT CI step fails with a confusing
// `prettier --check` warning about a file nobody wrote by hand.
//
// So: whatever the tests produced, the tree must be unchanged.

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
 * Only paths a test could have produced:
 *  - `??` — a new untracked file
 *  - a dirty WORKTREE column — a tracked file modified on disk
 *
 * A staged-only entry (`M `) is the developer's own work in progress, not test
 * output, so it is ignored. That keeps the check usable locally while staying
 * exact in CI, where the checkout is clean to begin with.
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
