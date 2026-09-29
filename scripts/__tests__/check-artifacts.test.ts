import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const REAL_SCRIPT = join(process.cwd(), 'scripts', 'check-artifacts.mjs');

interface RunResult {
  code: number;
  out: string;
}

function runCheck(dir: string): RunResult {
  try {
    const out = execFileSync('node', [join(dir, 'scripts', 'check-artifacts.mjs')], {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function git(dir: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}

/** A committed repo whose working tree starts clean — the state CI is in. */
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onda-artifacts-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  writeFileSync(join(dir, 'a.txt'), 'committed\n');
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(REAL_SCRIPT, join(dir, 'scripts', 'check-artifacts.mjs'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'chore: fixture');
  return dir;
}

describe('check:artifacts', () => {
  const dirs: string[] = [];
  const repo = (): string => {
    const dir = makeRepo();
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('passes when the tests left nothing behind', () => {
    const result = runCheck(repo());
    expect(result.code).toBe(0);
    expect(result.out).toContain('no test artifacts');
  });

  it('fails on an untracked file dropped in the repo root', () => {
    // The regression: a test writing through a path that resolves to the repo
    // root leaves a file that `prettier --check` then rejects on CI.
    const dir = repo();
    writeFileSync(join(dir, 'onda-radio-test.json'), '{}');
    const result = runCheck(dir);
    expect(result.code).toBe(1);
    expect(result.out).toContain('onda-radio-test.json');
    expect(result.out).toContain('os.tmpdir()');
  });

  it('fails when a test modifies a tracked file', () => {
    const dir = repo();
    writeFileSync(join(dir, 'a.txt'), 'mutated by a test\n');
    const result = runCheck(dir);
    expect(result.code).toBe(1);
    expect(result.out).toContain('a.txt');
  });

  it('ignores a staged change, which is the developer own work in progress', () => {
    // Keeps the check usable locally: `git add` without commit is not an
    // artifact, and CI never reaches that state anyway.
    const dir = repo();
    writeFileSync(join(dir, 'b.txt'), 'work in progress\n');
    git(dir, 'add', 'b.txt');
    const result = runCheck(dir);
    expect(result.code).toBe(0);
  });

  it('fails when a test stages a file, which no test should ever do', () => {
    const dir = repo();
    writeFileSync(join(dir, 'c.txt'), 'x\n');
    git(dir, 'add', 'c.txt');
    git(dir, 'commit', '-q', '-m', 'sneaky');
    writeFileSync(join(dir, 'd.txt'), 'y\n');
    const result = runCheck(dir);
    expect(result.code).toBe(1);
    expect(result.out).toContain('d.txt');
  });
});
