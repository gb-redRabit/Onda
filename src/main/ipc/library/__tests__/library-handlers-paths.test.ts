import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join, normalize, sep } from 'node:path';
import { tmpdir } from 'node:os';

const h = vi.hoisted(() => ({
  isSensitivePath: vi.fn()
}));

vi.mock('../../path-policy', () => ({ isSensitivePath: h.isSensitivePath }));

import {
  MAX_ADDED_FILES,
  MAX_SCAN_FOLDERS,
  isSystemTemp,
  sanitizeFilePaths,
  sanitizeFolderPaths,
  withoutSensitivePaths
} from '../library-handlers-paths';

beforeEach(() => {
  h.isSensitivePath.mockReset().mockReturnValue(false);
});

describe('sanitizeFilePaths', () => {
  it('keeps absolute unique strings only', () => {
    const abs = join('/', 'music', 'a.mp3');
    const paths = sanitizeFilePaths([
      abs,
      ` ${abs} `,
      'relative/a.mp3',
      '',
      null,
      42,
      join('/', 'music', 'b.mp3'),
      join('/', 'music', 'b.mp3')
    ]);

    expect(paths).toEqual([abs, join('/', 'music', 'b.mp3')]);
  });

  it('returns an empty list for non-arrays', () => {
    expect(sanitizeFilePaths('x')).toEqual([]);
    expect(sanitizeFilePaths(undefined)).toEqual([]);
  });

  it('caps the number of files', () => {
    const input = Array.from({ length: MAX_ADDED_FILES + 10 }, (_, i) =>
      join('/', 'music', `${i}.mp3`)
    );

    expect(sanitizeFilePaths(input)).toHaveLength(MAX_ADDED_FILES);
  });
});

describe('sanitizeFolderPaths', () => {
  it('keeps absolute unique folders and caps the list', () => {
    const input = Array.from({ length: MAX_SCAN_FOLDERS + 10 }, (_, i) =>
      join('/', 'library', String(i))
    );

    expect(sanitizeFolderPaths(input)).toHaveLength(MAX_SCAN_FOLDERS);
    expect(sanitizeFolderPaths(input)[0]).toBe(input[0]);
  });

  it('rejects relative and non-string entries', () => {
    expect(sanitizeFolderPaths(['relative', '', 5, null])).toEqual([]);
  });

  it('returns an empty list for non-array folder input', () => {
    expect(sanitizeFolderPaths('x')).toEqual([]);
    expect(sanitizeFolderPaths(undefined)).toEqual([]);
  });
});

describe('isSystemTemp', () => {
  const temp = normalize(tmpdir());

  it('accepts the temp dir and its children', () => {
    expect(isSystemTemp(temp)).toBe(true);
    expect(isSystemTemp(join(temp, 'nested'))).toBe(true);
  });

  it('rejects paths outside the temp dir', () => {
    expect(isSystemTemp(join(temp + '-other', 'x'))).toBe(false);
    expect(isSystemTemp(normalize('/'))).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSystemTemp(temp.toUpperCase())).toBe(true);
  });

  it('handles a trailing separator', () => {
    expect(isSystemTemp(temp + sep)).toBe(true);
  });
});

describe('withoutSensitivePaths', () => {
  it('keeps temp paths and non-sensitive paths', () => {
    const temp = join(normalize(tmpdir()), 'nested');
    const clean = join('/', 'music');
    h.isSensitivePath.mockImplementation((p: string) => p !== clean);

    expect(withoutSensitivePaths([temp, clean])).toEqual([temp, clean]);
  });

  it('drops sensitive non-temp paths', () => {
    h.isSensitivePath.mockReturnValue(true);

    expect(withoutSensitivePaths([join('/', 'home', '.ssh')])).toEqual([]);
  });
});
