import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addAllowedRoot, getExtraRoots } from '../../media/media-server';
import { createScanBudget, scanDir } from '../library-scan';

// Two ceilings that used to bound the *result* rather than the *cost*: a
// renderer could grow the media allowlist one call at a time without limit, and
// a library scan read and parsed every file before dropping the excess.

describe('extraRoots is bounded', () => {
  const CAP = 200;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onda-roots-'));
  });

  it('refuses new roots past the ceiling without evicting what is already granted', async () => {
    // The list is module state with no exported reset, so this one test owns
    // filling it rather than assuming a clean start.
    const first = join(dir, 'first');
    await mkdir(first, { recursive: true });
    expect(await addAllowedRoot(first)).toBe(true);

    for (let i = 0; i < CAP + 5; i++) {
      const sub = join(dir, `r${i}`);
      await mkdir(sub, { recursive: true });
      const ok = await addAllowedRoot(sub);
      if (i < CAP - 1) expect(ok, `root ${i} should be accepted`).toBe(true);
      else expect(ok, `root ${i} should be refused`).toBe(false);
    }

    const roots = getExtraRoots();
    expect(roots.length).toBe(CAP);
    // A refused grant must not evict something already allowed, or a runaway
    // caller could knock out folders the app is actively playing from.
    expect(roots).toContain(first);
    expect(roots).toContain(join(dir, 'r0'));

    // Idempotent: re-asking for an already-allowed root is not a new root, so it
    // is not refused even with the list at the ceiling.
    expect(await addAllowedRoot(first)).toBe(true);
    expect(getExtraRoots().length).toBe(CAP);
  });
});

describe('scanDir budget stops the walk instead of the result', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onda-budget-'));
  });

  async function makeTracks(count: number): Promise<void> {
    await mkdir(dir, { recursive: true });
    const id3 = Buffer.concat([
      Buffer.from('ID3'),
      Buffer.from([0x04, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])
    ]);
    await Promise.all(
      Array.from({ length: count }, (_u, i) =>
        writeFile(join(dir, `t${String(i).padStart(4, '0')}.mp3`), id3)
      )
    );
  }

  it('stops reading once the budget is spent', async () => {
    await makeTracks(200);
    const budget = createScanBudget(20);
    const result = await scanDir(dir, 8, 0, undefined, undefined, budget);

    expect(result.files.length).toBeLessThanOrEqual(20);
    expect(budget.truncated).toBe(true);
  });

  it('leaves the flag alone when everything fits', async () => {
    await makeTracks(5);
    const budget = createScanBudget(500);
    const result = await scanDir(dir, 8, 0, undefined, undefined, budget);

    expect(result.files.length).toBe(5);
    expect(budget.truncated).toBe(false);
  });

  it('scans everything when no budget is supplied', async () => {
    await makeTracks(60);
    const result = await scanDir(dir, 8, 0);
    expect(result.files.length).toBe(60);
  });
});
