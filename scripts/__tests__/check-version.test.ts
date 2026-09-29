import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// `scripts/check-version.mjs` is the guard that stops a hand-edited version
// from disagreeing with release-please. It is the one script in the repo that
// nothing tests, so it is exercised here against throwaway repositories.

const REAL_SCRIPT = join(process.cwd(), 'scripts', 'check-version.mjs');

interface RunResult {
  code: number;
  out: string;
}

/** Runs the copy inside `dir` — the script resolves its root from its own path. */
function runCheck(dir: string): RunResult {
  try {
    const out = execFileSync('node', [join(dir, 'scripts', 'check-version.mjs')], {
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

/** Builds a throwaway repo in the state the guard is meant to accept. */
function makeRepo(version: string, recorded: string | null, tag: string | null, subject: string) {
  const dir = mkdtempSync(join(tmpdir(), 'onda-version-check-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'onda', version, scripts: {} }, null, 2)
  );
  if (recorded !== null) {
    writeFileSync(
      join(dir, '.release-please-manifest.json'),
      JSON.stringify({ '.': recorded }, null, 2)
    );
  }
  // The script resolves its repo root from its own location, so a copy of the
  // real script is what has to run inside the fixture.
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(REAL_SCRIPT, join(dir, 'scripts', 'check-version.mjs'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', subject);
  if (tag) git(dir, 'tag', tag);
  return dir;
}

describe('version:check', () => {
  const dirs: string[] = [];
  const repo = (...args: Parameters<typeof makeRepo>): string => {
    const dir = makeRepo(...args);
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('passes when the version matches the newest tag', () => {
    const result = runCheck(repo('0.4.3', '0.4.3', 'v0.4.3', 'fix: something'));
    expect(result.code).toBe(0);
    expect(result.out).toContain('0.4.3');
  });

  it('passes when a release commit carries the version ahead of the tag', () => {
    // The release PR is merged but release-please has not pushed the tag yet.
    const result = runCheck(repo('0.5.0', '0.5.0', 'v0.4.3', 'chore(main): release 0.5.0'));
    expect(result.code).toBe(0);
  });

  it('fails on a hand-edited version that is ahead of the tag', () => {
    // The exact regression: someone ran `npm version` on main while
    // release-please had computed a different number.
    const result = runCheck(repo('0.4.4', '0.4.4', 'v0.4.3', 'chore(release): 0.4.4'));
    expect(result.code).toBe(1);
    expect(result.out).toContain('Only release-please may move the version');
  });

  it('fails when a release-please PR bumps the version', () => {
    // A hand edit that lowers the version back to the released value is
    // indistinguishable from doing nothing, so it passes — but a bump to a
    // number release-please did not ask for is rejected.
    const lowered = runCheck(repo('0.4.3', '0.4.3', 'v0.4.3', 'chore(main): release 0.4.3'));
    expect(lowered.code).toBe(0);

    const raised = runCheck(repo('0.4.4', '0.4.4', 'v0.4.3', 'chore(release): 0.4.4'));
    expect(raised.code).toBe(1);
    expect(raised.out).toContain('Only release-please may move the version');
  });

  it('fails when the release-please state is lost', () => {
    const result = runCheck(repo('0.4.3', null, 'v0.4.3', 'chore(main): release 0.4.3'));
    expect(result.code).toBe(1);
    expect(result.out).toContain('.release-please-manifest.json is missing');
  });

  it('skips the tag comparison before the first release', () => {
    const result = runCheck(repo('0.1.0', '0.1.0', null, 'feat: first release'));
    expect(result.code).toBe(0);
    expect(result.out).toContain('no v* tags yet');
  });
});
