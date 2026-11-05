import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// `rename` jest jedyną podstawianą operacją — reszta `fs/promises` działa
// naprawdę, więc test sprawdza też faktyczną podmianę pliku na dysku.
const fsMocks = vi.hoisted(() => ({
  rename: vi.fn(),
  actualRename: null as null | ((from: string, to: string) => Promise<void>)
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  fsMocks.actualRename = actual.rename;
  return { ...actual, rename: fsMocks.rename };
});

const { replaceFileAtomic, safeRm, safeUnlink } = await import('../fs-atomic');

const root = mkdtempSync(join(tmpdir(), 'onda-fs-atomic-'));

beforeEach(() => {
  fsMocks.rename.mockReset();
  fsMocks.rename.mockImplementation(fsMocks.actualRename!);
});

afterAll(() => {
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

function fileError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('replaceFileAtomic', () => {
  it('replaces the target file', async () => {
    const src = join(root, 'replace-src');
    const target = join(root, 'replace-target');
    writeFileSync(src, 'new');
    writeFileSync(target, 'old');

    await replaceFileAtomic(src, target);

    expect(readFileSync(target, 'utf8')).toBe('new');
    expect(existsSync(src)).toBe(false);
  });

  it('retries a transient EBUSY lock and then succeeds', async () => {
    vi.useFakeTimers();
    const src = join(root, 'retry-src');
    const target = join(root, 'retry-target');
    writeFileSync(src, 'new');
    writeFileSync(target, 'old');

    fsMocks.rename.mockRejectedValueOnce(fileError('EBUSY'));
    const pending = replaceFileAtomic(src, target);
    await vi.advanceTimersByTimeAsync(120);
    await pending;

    expect(fsMocks.rename).toHaveBeenCalledTimes(2);
    expect(readFileSync(target, 'utf8')).toBe('new');
    vi.useRealTimers();
  });

  it('gives up after four locked attempts and rethrows the last error', async () => {
    fsMocks.rename.mockRejectedValue(fileError('EPERM'));

    // Realne opóźnienia to 120+240+360 ms — poniżej limitu testu, a nie wymagają
    // żonglowania timerami przy każdej kolejnej próbie.
    await expect(replaceFileAtomic(join(root, 'a'), join(root, 'b'))).rejects.toThrow('EPERM');
    expect(fsMocks.rename).toHaveBeenCalledTimes(4);
  });

  it('does not retry an unrelated error', async () => {
    fsMocks.rename.mockRejectedValue(fileError('ENOENT'));

    await expect(replaceFileAtomic(join(root, 'missing'), join(root, 'target'))).rejects.toThrow(
      'ENOENT'
    );
    expect(fsMocks.rename).toHaveBeenCalledTimes(1);
  });
});

describe('safeUnlink', () => {
  it('removes an existing file', async () => {
    const path = join(root, 'unlink-me');
    writeFileSync(path, 'x');
    await safeUnlink(path);
    expect(existsSync(path)).toBe(false);
  });

  it('ignores a missing file', async () => {
    await expect(safeUnlink(join(root, 'not-there'))).resolves.toBeUndefined();
  });
});

describe('safeRm', () => {
  it('removes a directory recursively', async () => {
    const dir = join(root, 'rm-me');
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'nested', 'file'), 'x');
    await safeRm(dir, true);
    expect(existsSync(dir)).toBe(false);
  });

  it('ignores a missing path', async () => {
    await expect(safeRm(join(root, 'gone'), true)).resolves.toBeUndefined();
  });
});
