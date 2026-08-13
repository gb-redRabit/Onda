import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { sha256File } from '../hash-file';
import { createHash } from 'crypto';

describe('sha256File', () => {
  it('computes the sha256 of a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-hash-test-'));
    const file = join(dir, 'a.txt');
    try {
      await writeFile(file, 'hello world', 'utf-8');
      const expected = createHash('sha256').update('hello world').digest('hex');
      await expect(sha256File(file)).resolves.toBe(expected);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects for a missing file', async () => {
    await expect(sha256File('C:\\no\\such\\file\\here.mp3')).rejects.toBeTruthy();
  });
});
