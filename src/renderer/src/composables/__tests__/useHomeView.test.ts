import { describe, expect, it } from 'vitest';
import { playCountBadge } from '../useHomeView';

describe('playCountBadge', () => {
  it('hides the badge for an unknown or single play', () => {
    expect(playCountBadge(undefined)).toBe('');
    expect(playCountBadge(0)).toBe('');
    expect(playCountBadge(1)).toBe('');
  });

  it('shows the count from the second play', () => {
    expect(playCountBadge(2)).toBe('2×');
    expect(playCountBadge(14)).toBe('14×');
  });
});
