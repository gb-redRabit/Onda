import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { hashFile } from '../hash';

// Streaming SHA-256 with an optional byte budget; oversized files resolve null
// instead of hashing gigabytes.

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-hashfile-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('hashFile', () => {
  it('computes the sha256 digest of a file', async () => {
    const file = join(dir, 'a.bin');
    await writeFile(file, 'hello world');

    await expect(hashFile(file)).resolves.toBe(
      createHash('sha256').update('hello world').digest('hex')
    );
  });

  it('hashes files exactly at the budget', async () => {
    const file = join(dir, 'exact.bin');
    await writeFile(file, 'abc');

    await expect(hashFile(file, 3)).resolves.toBe(createHash('sha256').update('abc').digest('hex'));
  });

  it('returns null once the file exceeds maxBytes', async () => {
    const file = join(dir, 'big.bin');
    await writeFile(file, 'abcdef');

    await expect(hashFile(file, 3)).resolves.toBeNull();
  });

  it('rejects for a missing file', async () => {
    await expect(hashFile(join(dir, 'missing.bin'))).rejects.toBeTruthy();
  });
});
