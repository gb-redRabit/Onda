import { describe, expect, it } from 'vitest';
import { pluralCategory } from '../plural';

describe('pluralCategory', () => {
  it('maps Polish one/few/many', () => {
    expect(pluralCategory('pl', 1)).toBe('one');
    expect(pluralCategory('pl', 2)).toBe('few');
    expect(pluralCategory('pl', 4)).toBe('few');
    expect(pluralCategory('pl', 5)).toBe('many');
    expect(pluralCategory('pl', 22)).toBe('few');
    expect(pluralCategory('pl', 25)).toBe('many');
  });

  it('falls back to many for English plurals', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 0)).toBe('many');
    expect(pluralCategory('en', 2)).toBe('many');
  });

  it('ignores the region subtag', () => {
    expect(pluralCategory('pl-PL', 3)).toBe('few');
    expect(pluralCategory('en-US', 1)).toBe('one');
  });

  it('defaults to English for an empty locale', () => {
    expect(pluralCategory('', 1)).toBe('one');
    expect(pluralCategory('', 3)).toBe('many');
  });
});
