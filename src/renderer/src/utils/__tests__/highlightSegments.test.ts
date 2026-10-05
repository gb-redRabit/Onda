import { describe, it, expect } from 'vitest';
import { highlightSegments } from '../highlightSegments';

describe('highlightSegments', () => {
  it('returns the whole text as a non-match when there is no query', () => {
    expect(highlightSegments('Hello world')).toEqual([{ text: 'Hello world', match: false }]);
    expect(highlightSegments('Hello world', '   ')).toEqual([
      { text: 'Hello world', match: false }
    ]);
  });

  it('marks every occurrence, not only the first', () => {
    expect(highlightSegments('ab ab ab', 'ab')).toEqual([
      { text: 'ab', match: true },
      { text: ' ', match: false },
      { text: 'ab', match: true },
      { text: ' ', match: false },
      { text: 'ab', match: true }
    ]);
  });

  it('is case-insensitive but keeps the original casing in the output', () => {
    expect(highlightSegments('Hello World', 'world')).toEqual([
      { text: 'Hello ', match: false },
      { text: 'World', match: true }
    ]);
  });

  it('treats regex metacharacters in the query literally', () => {
    const segments = highlightSegments('a.b (c)', '.');
    expect(segments).toEqual([
      { text: 'a', match: false },
      { text: '.', match: true },
      { text: 'b (c)', match: false }
    ]);
  });

  it('handles Turkish İ without corrupting the offsets', () => {
    const segments = highlightSegments('İstanbul ist', 'ist');
    expect(segments.map((s) => s.text).join('')).toBe('İstanbul ist');
    expect(segments.some((s) => s.match)).toBe(true);
  });
});
