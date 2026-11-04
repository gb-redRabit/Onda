import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isReadableMediaPath } from '../read-access';
import { addAllowedRoot, setAllowedRoots } from '../media-server';

describe('isReadableMediaPath', () => {
  let root = '';
  let outside = '';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'onda-read-allowed-'));
    outside = await mkdtemp(join(tmpdir(), 'onda-read-denied-'));
    await writeFile(join(root, 'inside.mp3'), Buffer.from('ID3'));
    await writeFile(join(outside, 'outside.mp3'), Buffer.from('ID3'));
    await setAllowedRoots([root]);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await rm(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('accepts files inside a library root', () => {
    expect(isReadableMediaPath(join(root, 'inside.mp3'))).toBe(true);
  });

  it('rejects files outside every allowed root', () => {
    expect(isReadableMediaPath(join(outside, 'outside.mp3'))).toBe(false);
  });

  it('accepts files in an explicitly granted root', async () => {
    const granted = await addAllowedRoot(outside);
    expect(granted).toBe(true);
    expect(isReadableMediaPath(join(outside, 'outside.mp3'))).toBe(true);
  });

  it('rejects missing files instead of trusting the path', () => {
    expect(isReadableMediaPath(join(root, 'missing.mp3'))).toBe(false);
  });
});
