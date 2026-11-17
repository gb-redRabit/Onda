import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const fsState = vi.hoisted(() => ({ failStat: false }));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    stat: async (...args: Parameters<typeof actual.stat>) => {
      if (fsState.failStat) throw new Error('EACCES');
      return actual.stat(...args);
    }
  };
});

import { clearDirContents } from '../clear-dir';

describe('clearDirContents', () => {
  it('removes files and subdirectories, reporting entries and file bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-clear-dir-'));
    try {
      await writeFile(join(dir, 'a.bin'), Buffer.alloc(10));
      await writeFile(join(dir, 'b.bin'), Buffer.alloc(25));
      await mkdir(join(dir, 'nested'));
      await writeFile(join(dir, 'nested', 'c.bin'), Buffer.alloc(100));

      const result = await clearDirContents(dir);

      expect(result).toEqual({ removed: 3, bytesFreed: 35 });
      await expect(readdir(dir)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is a no-op for an empty or missing directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-clear-dir-'));
    try {
      await expect(clearDirContents(dir)).resolves.toEqual({ removed: 0, bytesFreed: 0 });
      await expect(clearDirContents(join(dir, 'missing'))).resolves.toEqual({
        removed: 0,
        bytesFreed: 0
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('removes entries whose metadata cannot be read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-clear-dir-'));
    try {
      await writeFile(join(dir, 'locked.bin'), Buffer.alloc(10));
      fsState.failStat = true;
      try {
        await expect(clearDirContents(dir)).resolves.toEqual({ removed: 1, bytesFreed: 0 });
      } finally {
        fsState.failStat = false;
      }
      await expect(readdir(dir)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
