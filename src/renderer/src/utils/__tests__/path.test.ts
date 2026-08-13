import { describe, it, expect } from 'vitest';
import { isUnderPath, sanitizeDirName, joinPath } from '../path';

describe('sanitizeDirName', () => {
  it('keeps plain names unchanged', () => {
    expect(sanitizeDirName('Mr Beast')).toBe('Mr Beast');
    expect(sanitizeDirName('NPR Music')).toBe('NPR Music');
  });

  it('replaces invalid characters', () => {
    expect(sanitizeDirName('a:b*c?d"e<f>g|h')).toBe('a b c d e f g h');
    expect(sanitizeDirName('C:\\foo').includes('foo')).toBe(true);
    expect(sanitizeDirName('M\\/:*?"<>|X')).toBe('M X');
  });

  it('collapses whitespace', () => {
    expect(sanitizeDirName('  a   b  ')).toBe('a b');
  });

  it('strips trailing dots and spaces', () => {
    expect(sanitizeDirName('folder...')).toBe('folder');
    expect(sanitizeDirName('folder  ')).toBe('folder');
  });

  it('uses fallback for empty or invalid input', () => {
    expect(sanitizeDirName('')).toBe('channel');
    expect(sanitizeDirName(':::')).toBe('channel');
    expect(sanitizeDirName(undefined as unknown as string)).toBe('channel');
  });

  it('prefixes reserved Windows device names', () => {
    expect(sanitizeDirName('con').startsWith('_')).toBe(true);
    expect(sanitizeDirName('CON')).not.toBe('CON');
    expect(sanitizeDirName('nul')).not.toBe('nul');
    expect(sanitizeDirName('com1')).not.toBe('com1');
    expect(sanitizeDirName('lpt9')).not.toBe('lpt9');
  });
});

describe('joinPath', () => {
  it('joins with forward slash by default', () => {
    expect(joinPath('/home/user', 'Music', 'Channel')).toBe('/home/user/Music/Channel');
  });

  it('joins with backslash when a segment uses backslashes', () => {
    expect(joinPath('C:\\Users\\Downloads', 'Channel')).toBe('C:\\Users\\Downloads\\Channel');
  });

  it('strips leading and trailing separators', () => {
    expect(joinPath('/home/user/', '/Music', 'Channel/')).toBe('/home/user/Music/Channel');
    expect(joinPath('C:\\Users\\', '\\Music', 'Channel\\')).toBe('C:\\Users\\Music\\Channel');
  });

  it('ignores empty segments', () => {
    expect(joinPath('/a', '', 'b')).toBe('/a/b');
    expect(joinPath('', '', '')).toBe('');
  });

  it('returns empty string for no segments', () => {
    expect(joinPath()).toBe('');
  });
});

describe('isUnderPath', () => {
  it('detects files inside a folder', () => {
    expect(isUnderPath('/a/b/c.mp3', '/a')).toBe(true);
    expect(isUnderPath('C:\\a\\b.mp3', 'C:\\a')).toBe(true);
  });

  it('rejects files outside a folder', () => {
    expect(isUnderPath('/a2/b.mp3', '/a')).toBe(false);
    expect(isUnderPath('/a', '/a/b')).toBe(false);
  });

  it('treats exact match as inside', () => {
    expect(isUnderPath('/a', '/a')).toBe(true);
  });
});
