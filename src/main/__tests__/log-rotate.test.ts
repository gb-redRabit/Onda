import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rotateLogIfNeeded } from '../log-rotate';

let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-logrotate-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('rotateLogIfNeeded', () => {
  it('moves an oversized file to .1 and leaves no current file', async () => {
    const file = join(dir, 'a.log');
    await writeFile(file, 'x'.repeat(100));

    expect(await rotateLogIfNeeded(file, 50)).toBe(true);
    expect((await stat(join(dir, 'a.log.1'))).size).toBe(100);
    await expect(stat(file)).rejects.toThrow();
  });

  it('does nothing when the file is under the cap', async () => {
    const file = join(dir, 'b.log');
    await writeFile(file, 'x'.repeat(10));

    expect(await rotateLogIfNeeded(file, 50)).toBe(false);
    expect((await stat(file)).size).toBe(10);
  });

  it('replaces the previous rotation', async () => {
    const file = join(dir, 'c.log');
    await writeFile(file, 'A'.repeat(100));
    await rotateLogIfNeeded(file, 50);
    await writeFile(file, 'B'.repeat(100));
    await rotateLogIfNeeded(file, 50);

    expect(await readFile(join(dir, 'c.log.1'), 'utf-8')).toBe('B'.repeat(100));
  });

  it('is a no-op when the file is missing', async () => {
    expect(await rotateLogIfNeeded(join(dir, 'missing.log'), 50)).toBe(false);
  });
});
