import { describe, expect, it } from 'vitest';
import { formatTabLabel, isDrivePath, parentPath } from '../explorerPath';

describe('isDrivePath', () => {
  it('recognizes empty and drive-root paths', () => {
    expect(isDrivePath('')).toBe(true);
    expect(isDrivePath('C:')).toBe(true);
    expect(isDrivePath('c:')).toBe(true);
    expect(isDrivePath('C:\\')).toBe(true);
  });

  it('rejects nested and POSIX paths', () => {
    expect(isDrivePath('C:\\Music')).toBe(false);
    expect(isDrivePath('/home')).toBe(false);
    expect(isDrivePath('C:/')).toBe(false);
  });
});

describe('parentPath', () => {
  it('returns an empty parent for roots and empty input', () => {
    expect(parentPath('')).toBe('');
    expect(parentPath('C:')).toBe('');
    expect(parentPath('C:\\')).toBe('');
  });

  it('walks Windows paths with either separator and tolerates trailing slashes', () => {
    expect(parentPath('C:\\Music\\a.mp3')).toBe('C:\\Music');
    expect(parentPath('C:/Music/a.mp3')).toBe('C:/Music');
    expect(parentPath('C:\\Music\\')).toBe('C:');
    expect(parentPath('C:\\Music')).toBe('C:');
  });

  it('walks POSIX paths and keeps the filesystem root', () => {
    expect(parentPath('/foo')).toBe('/');
    expect(parentPath('/foo/bar/')).toBe('/foo');
    expect(parentPath('/foo/bar/baz')).toBe('/foo/bar');
    expect(parentPath('\\foo')).toBe('');
    expect(parentPath('folder')).toBe('');
  });
});

describe('formatTabLabel', () => {
  it('uses the last path segment', () => {
    expect(formatTabLabel('C:\\Music\\Albums')).toBe('Albums');
    expect(formatTabLabel('/home/user/')).toBe('user');
    expect(formatTabLabel('folder')).toBe('folder');
  });

  it('handles empty and root-only paths', () => {
    expect(formatTabLabel('')).toBe('');
    expect(formatTabLabel('/')).toBe('/');
  });
});
