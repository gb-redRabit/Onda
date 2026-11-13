import { describe, expect, it } from 'vitest';

import { binFreq } from '../visualizerBins';

describe('binFreq', () => {
  it('averages and rounds buckets', () => {
    expect(binFreq(8, new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), 4)).toEqual([1, 3, 5, 7]);
  });

  it('reuses the scratch buffer for the same bucket count', () => {
    const first = binFreq(8, new Uint8Array(8).fill(10), 4);
    const second = binFreq(8, new Uint8Array(8).fill(20), 4);

    expect(second).toBe(first);
    expect(second).toEqual([20, 20, 20, 20]);
  });

  it('allocates a new buffer for a different bucket count', () => {
    const first = binFreq(8, new Uint8Array(8).fill(10), 4);
    const second = binFreq(8, new Uint8Array(8).fill(10), 2);

    expect(second).not.toBe(first);
    expect(second).toHaveLength(2);
  });

  it('returns zeros when there are fewer samples than buckets', () => {
    expect(binFreq(2, new Uint8Array([255, 255]), 4)).toEqual([0, 0, 0, 0]);
  });

  it('clamps the final bucket to the available samples', () => {
    expect(binFreq(5, new Uint8Array([10, 20, 30, 40, 50]), 2)).toEqual([15, 35]);
  });

  it('handles silent input', () => {
    expect(binFreq(4, new Uint8Array(4), 2)).toEqual([0, 0]);
  });
});
