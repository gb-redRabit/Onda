import { describe, expect, it, vi } from 'vitest';

import { getFrequencyBins } from '../audioViz';

function analyser(values: number[], throwOnRead = false) {
  return {
    frequencyBinCount: values.length,
    getByteFrequencyData: vi.fn((target: Uint8Array) => {
      if (throwOnRead) throw new Error('no audio');
      target.set(values);
    })
  } as unknown as AnalyserNode;
}

describe('getFrequencyBins', () => {
  it('returns no bins without an analyser', () => {
    expect(getFrequencyBins(null, 4)).toEqual([]);
    expect(getFrequencyBins(undefined, 4)).toEqual([]);
  });

  it('averages and rounds buckets', () => {
    expect(getFrequencyBins(analyser([0, 1, 2, 3, 4, 5, 6, 7]), 4)).toEqual([1, 3, 5, 7]);
  });

  it('clamps the last bucket to the available data', () => {
    expect(getFrequencyBins(analyser([10, 20, 30, 40, 50]), 2)).toEqual([15, 35]);
  });

  it('returns zero bins for silent input', () => {
    expect(getFrequencyBins(analyser([0, 0, 0, 0]), 2)).toEqual([0, 0]);
  });

  it('returns no bins when there are fewer samples than requested bins', () => {
    expect(getFrequencyBins(analyser([255, 255]), 4)).toEqual([]);
  });

  it('swallows analyser failures', () => {
    expect(getFrequencyBins(analyser([1], true), 1)).toEqual([]);
  });
});
