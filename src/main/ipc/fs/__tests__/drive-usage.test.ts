import { describe, expect, it } from 'vitest';
import { volumeUsageFromStatfs } from '../fs-utils';

// Pasek zajętości dysku liczy się z `statfs`. Systemy plików potrafią zwrócić
// wartości, których nie da się wprost pokazać (bavail > blocks, zera przy pustej
// stacji CD), więc normalizacja musi być pokryta testem.

describe('volumeUsageFromStatfs', () => {
  it('multiplies block counts by the block size', () => {
    const usage = volumeUsageFromStatfs({ bsize: 4096, blocks: 1000, bavail: 250 });

    expect(usage).toEqual({ total: 4_096_000, free: 1_024_000 });
  });

  it('never reports more free space than the volume size', () => {
    const usage = volumeUsageFromStatfs({ bsize: 512, blocks: 100, bavail: 400 });

    expect(usage.total).toBe(51_200);
    expect(usage.free).toBe(51_200);
  });

  it('clamps negative free space to zero', () => {
    const usage = volumeUsageFromStatfs({ bsize: 512, blocks: 100, bavail: -10 });

    expect(usage).toEqual({ total: 51_200, free: 0 });
  });

  it('returns an empty usage when the volume size is unusable', () => {
    expect(volumeUsageFromStatfs({ bsize: 0, blocks: 100, bavail: 10 })).toEqual({
      total: 0,
      free: 0
    });
    expect(volumeUsageFromStatfs({ bsize: 4096, blocks: Number.NaN, bavail: 10 })).toEqual({
      total: 0,
      free: 0
    });
  });
});
