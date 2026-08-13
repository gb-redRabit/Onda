import { describe, it, expect } from 'vitest';
import { isSafeAbsolutePath, isSafeStringArray } from '../validate';

describe('isSafeAbsolutePath', () => {
  it('accepts a valid absolute path', () => {
    expect(isSafeAbsolutePath('C:/Users/test/file.mp3')).toBe(true);
    expect(isSafeAbsolutePath('/home/user/file.mp3')).toBe(true);
  });

  it('rejects non-strings, empty strings and relative paths', () => {
    expect(isSafeAbsolutePath(null)).toBe(false);
    expect(isSafeAbsolutePath(undefined)).toBe(false);
    expect(isSafeAbsolutePath(123)).toBe(false);
    expect(isSafeAbsolutePath('')).toBe(false);
    expect(isSafeAbsolutePath('relative/file.mp3')).toBe(false);
  });

  it('rejects null bytes and oversized paths', () => {
    expect(isSafeAbsolutePath('C:/a\0b.mp3')).toBe(false);
    expect(isSafeAbsolutePath('C:/' + 'a'.repeat(5000))).toBe(false);
  });
});

describe('isSafeStringArray', () => {
  it('accepts an array of strings', () => {
    expect(isSafeStringArray(['a', 'b'])).toBe(true);
    expect(isSafeStringArray([])).toBe(true);
  });

  it('rejects non-arrays and mixed arrays', () => {
    expect(isSafeStringArray('a')).toBe(false);
    expect(isSafeStringArray([1, 2])).toBe(false);
    expect(isSafeStringArray(['a', null])).toBe(false);
  });
});
