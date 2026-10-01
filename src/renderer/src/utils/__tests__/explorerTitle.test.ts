import { describe, it, expect } from 'vitest';
import { explorerWindowTitle } from '../explorerTitle';

describe('explorerWindowTitle', () => {
  it('uses the fallback when there is no path', () => {
    expect(explorerWindowTitle(null, 'This PC')).toBe('This PC');
    expect(explorerWindowTitle('', 'This PC')).toBe('This PC');
  });

  it('returns the last segment of a posix path', () => {
    expect(explorerWindowTitle('/home/user/Music', 'This PC')).toBe('Music');
  });

  it('returns the last segment of a windows path', () => {
    expect(explorerWindowTitle('C:\\Users\\me\\Music', 'This PC')).toBe('Music');
  });

  it('ignores a trailing separator', () => {
    expect(explorerWindowTitle('C:\\Users\\me\\Music\\', 'This PC')).toBe('Music');
    expect(explorerWindowTitle('/home/user/Music/', 'This PC')).toBe('Music');
  });
});
