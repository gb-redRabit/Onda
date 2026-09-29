import { describe, expect, it } from 'vitest';
import { isPathInside } from '../path-security';

describe('isPathInside', () => {
  it('accepts the root and descendants but rejects prefix siblings and traversal', () => {
    expect(isPathInside('/opt/onda/app', '/opt/onda/app', 'linux')).toBe(true);
    expect(isPathInside('/opt/onda/app', '/opt/onda/app/renderer/index.html', 'linux')).toBe(true);
    expect(isPathInside('/opt/onda/app', '/opt/onda/app-malicious/index.html', 'linux')).toBe(
      false
    );
    expect(isPathInside('/opt/onda/app', '/opt/onda/other/../secret', 'linux')).toBe(false);
  });

  it('compares Windows paths case-insensitively and respects drive boundaries', () => {
    expect(
      isPathInside('C:\\Program Files\\Onda', 'c:\\program files\\onda\\app.asar', 'win32')
    ).toBe(true);
    expect(isPathInside('C:\\Program Files\\Onda', 'C:\\Program Files\\Onda-evil', 'win32')).toBe(
      false
    );
    expect(isPathInside('C:\\Program Files\\Onda', 'D:\\Program Files\\Onda', 'win32')).toBe(false);
  });
});
