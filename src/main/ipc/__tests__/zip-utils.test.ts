import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

import { findFile } from '../zip-utils';

const root = mkdtempSync(join(tmpdir(), 'onda-zip-utils-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function touch(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'x');
}

describe('findFile', () => {
  it('returns the exact match in the top directory', async () => {
    const dir = join(root, 'flat');
    touch(join(dir, 'ffmpeg.exe'));
    expect(await findFile(dir, 'ffmpeg.exe')).toBe(join(dir, 'ffmpeg.exe'));
  });

  it('searches nested directories recursively', async () => {
    const dir = join(root, 'nested');
    touch(join(dir, 'build', 'bin', 'ffprobe'));
    expect(await findFile(dir, 'ffprobe')).toBe(join(dir, 'build', 'bin', 'ffprobe'));
  });

  it('matches case-insensitively', async () => {
    const dir = join(root, 'case');
    touch(join(dir, 'FFMPEG.EXE'));
    expect(await findFile(dir, 'ffmpeg.exe')).toBe(join(dir, 'FFMPEG.EXE'));
  });

  it('skips a directory with the searched name and keeps looking', async () => {
    const dir = join(root, 'dir-name');
    mkdirSync(join(dir, 'ffmpeg'), { recursive: true });
    touch(join(dir, 'other', 'ffmpeg'));
    expect(await findFile(dir, 'ffmpeg')).toBe(join(dir, 'other', 'ffmpeg'));
  });

  it('returns null when the directory does not exist', async () => {
    expect(await findFile(join(root, 'missing'), 'ffmpeg')).toBeNull();
  });

  it('returns null when nothing matches', async () => {
    const dir = join(root, 'empty');
    mkdirSync(dir, { recursive: true });
    expect(await findFile(dir, 'ffmpeg')).toBeNull();
  });

  it('skips a matching entry whose metadata cannot be read', async () => {
    const dir = join(root, 'unreadable');
    touch(join(dir, 'locked.txt'));
    fsState.failStat = true;
    try {
      await expect(findFile(dir, 'locked.txt')).resolves.toBeNull();
    } finally {
      fsState.failStat = false;
    }
  });
});
