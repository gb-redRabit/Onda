import { describe, expect, it } from 'vitest';
import { resolveMediaPathForPlatform } from '../path-utils';

describe('resolveMediaPath', () => {
  it('keeps percent signs in plain Windows filenames', () => {
    expect(resolveMediaPathForPlatform('D:\\Music\\100%20Pure.mp3', 'win32')).toBe(
      'd:\\music\\100%20pure.mp3'
    );
  });

  it('converts Windows file URLs', () => {
    expect(resolveMediaPathForPlatform('file:///D:/Music/A.mp3', 'win32')).toBe('d:\\music\\a.mp3');
  });

  it('reads onda:// path and ignores extra query parameters', () => {
    expect(resolveMediaPathForPlatform('onda:///?path=D%3A%2FMusic%2FA.mp3&w=400', 'win32')).toBe(
      'd:\\music\\a.mp3'
    );
  });

  it('does not rewrite POSIX separators or lowercase Linux paths', () => {
    expect(resolveMediaPathForPlatform('/home/u/Music/A.mp3', 'linux')).toBe('/home/u/Music/A.mp3');
    expect(resolveMediaPathForPlatform('file:///home/u/A%20B.mp3', 'linux')).toBe(
      '/home/u/A B.mp3'
    );
    expect(resolveMediaPathForPlatform('onda:///?path=%2Fhome%2Fu%2FA.mp3&w=400', 'linux')).toBe(
      '/home/u/A.mp3'
    );
  });

  it('does not decode a plain POSIX path that contains a percent sign', () => {
    expect(resolveMediaPathForPlatform('/home/u/100%20Pure.mp3', 'linux')).toBe(
      '/home/u/100%20Pure.mp3'
    );
  });
});
