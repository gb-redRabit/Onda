import { describe, expect, it } from 'vitest';
import { stripUrls } from '../stripUrls';

describe('stripUrls', () => {
  it('removes http(s) and www links from descriptions', () => {
    expect(stripUrls('Listen on https://example.com/x and www.site.dev now')).toBe(
      'Listen on and now'
    );
  });

  it('keeps punctuation tidy after removing a link', () => {
    expect(stripUrls('Follow me https://example.com !')).toBe('Follow me!');
  });

  it('leaves text without links untouched', () => {
    expect(stripUrls('A normal description.')).toBe('A normal description.');
  });
});
