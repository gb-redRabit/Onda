import { describe, it, expect } from 'vitest';
import { sanitizeFilename, sanitizeFilenameSpaced } from '../text';

describe('sanitizeFilename', () => {
  it('replaces hostile characters and applies the default cap/fallback', () => {
    expect(sanitizeFilename('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i');
    expect(sanitizeFilename('')).toBe('track');
    expect(sanitizeFilename('x'.repeat(200))).toHaveLength(120);
  });

  it('strips trailing dots and spaces', () => {
    expect(sanitizeFilename('song... ')).toBe('song');
  });

  it('honours explicit options', () => {
    expect(sanitizeFilename('', { fallback: 'download', maxLength: 5 })).toBe('downl');
  });
});

describe('sanitizeFilenameSpaced', () => {
  it('collapses whitespace around hostile characters into a single space', () => {
    expect(sanitizeFilenameSpaced('a  /  b:c')).toBe('a b c');
    expect(sanitizeFilenameSpaced('   ')).toBe('download');
    expect(sanitizeFilenameSpaced('y'.repeat(300))).toHaveLength(180);
  });
});
