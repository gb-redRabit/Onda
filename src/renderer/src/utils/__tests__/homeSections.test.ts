import { describe, expect, it } from 'vitest';
import {
  HOME_SECTION_ORDER,
  isHomeSectionId,
  orderedHomeSections,
  toggleHomeSection
} from '../homeSections';
import type { HomeSectionId } from '@renderer/types/settings';

describe('homeSections', () => {
  it('exposes every section id through the type guard', () => {
    for (const id of HOME_SECTION_ORDER) expect(isHomeSectionId(id)).toBe(true);
    expect(isHomeSectionId('bogus')).toBe(false);
    expect(isHomeSectionId(42)).toBe(false);
    expect(isHomeSectionId(undefined)).toBe(false);
  });

  it('returns enabled sections in canonical order', () => {
    expect(orderedHomeSections(['artists', 'continue', 'albums'])).toEqual([
      'continue',
      'albums',
      'artists'
    ]);
  });

  it('ignores unknown stored ids', () => {
    const stored = ['recent', 'nope'] as unknown as HomeSectionId[];
    expect(orderedHomeSections(stored)).toEqual(['recent']);
  });

  it('toggles a section off', () => {
    expect(toggleHomeSection(['continue', 'albums'], 'continue')).toEqual(['albums']);
  });

  it('re-enables a section at its canonical position', () => {
    expect(toggleHomeSection(['recent', 'artists'], 'albums')).toEqual([
      'recent',
      'albums',
      'artists'
    ]);
  });

  it('keeps the canonical order regardless of the stored order', () => {
    expect(toggleHomeSection(['artists', 'recent'], 'favorites')).toEqual([
      'recent',
      'favorites',
      'artists'
    ]);
  });
});
