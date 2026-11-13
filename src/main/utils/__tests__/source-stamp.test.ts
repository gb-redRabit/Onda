import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { sourceStamp } from '../source-stamp';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-stamp-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Cache key for thumbnails/transcodes must change when the file changes (size or mtime).
describe('sourceStamp', () => {
  it('combines size and mtime for an existing file', async () => {
    const file = join(dir, 'a.jpg');
    await writeFile(file, 'hello');

    const s = await stat(file);
    await expect(sourceStamp(file)).resolves.toBe(`${s.size}:${s.mtimeMs}`);
  });

  it('returns an empty stamp for a missing file', async () => {
    await expect(sourceStamp(join(dir, 'missing.jpg'))).resolves.toBe('');
  });
});
