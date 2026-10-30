import { describe, it, expect } from 'vitest';
import { explorerWindowTitle } from '../explorerTitle';

describe('explorerWindowTitle', () => {
  it('uses the fallback when there is no path', () => {
    expect(explorerWindowTitle(null, 'This PC')).toBe('This PC');
    expect(explorerWindowTitle('', 'This PC')).toBe('This PC');
  });

  it('keeps the full posix path so same-named folders are distinguishable', () => {
    expect(explorerWindowTitle('/home/user/Music', 'This PC')).toBe('/home/user/Music');
  });

  it('keeps the full windows path', () => {
    expect(explorerWindowTitle('C:\\Users\\me\\Music', 'This PC')).toBe('C:\\Users\\me\\Music');
  });

  it('keeps a trailing separator as part of the path', () => {
    expect(explorerWindowTitle('C:\\Users\\me\\Music\\', 'This PC')).toBe('C:\\Users\\me\\Music\\');
    expect(explorerWindowTitle('/home/user/Music/', 'This PC')).toBe('/home/user/Music/');
  });
});
