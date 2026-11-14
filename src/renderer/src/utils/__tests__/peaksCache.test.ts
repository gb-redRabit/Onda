import { describe, expect, it } from 'vitest';
import { getCachedPeaks, hasCachedPeaks, setCachedPeaks } from '../peaksCache';

describe('peaks cache', () => {
  it('distinguishes a cached empty result from a miss', () => {
    setCachedPeaks('/a.mp3', null);
    expect(hasCachedPeaks('/a.mp3')).toBe(true);
    expect(getCachedPeaks('/a.mp3')).toBeNull();
    expect(hasCachedPeaks('/missing.mp3')).toBe(false);
    expect(getCachedPeaks('/missing.mp3')).toBeNull();
  });

  it('evicts the oldest entry after the limit', () => {
    for (let i = 0; i < 30; i++) setCachedPeaks(`/track-${i}.mp3`, [i]);
    expect(hasCachedPeaks('/track-0.mp3')).toBe(false);
    expect(hasCachedPeaks('/track-29.mp3')).toBe(true);
  });
});
