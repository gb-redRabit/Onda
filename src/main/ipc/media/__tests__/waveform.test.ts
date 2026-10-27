import { describe, expect, it } from 'vitest';
import { computePeaks, downsamplePeaks, PeakAccumulator } from '../waveform';

function pcm(samples: number[]): Int16Array {
  return Int16Array.from(samples);
}

describe('waveform peaks', () => {
  it('keeps the loudest sample per bucket and normalizes to 0..1', () => {
    const peaks = computePeaks(pcm([0, 16384, -32768, 8192, 0, 0, 16384, 0]), 4, 100);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(1, 5);
    expect(peaks[1]).toBeCloseTo(0.5, 5);
  });

  it('handles a trailing partial bucket', () => {
    const peaks = computePeaks(pcm([0, 16384, 0]), 2, 100);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(0.5, 5);
    expect(peaks[1]).toBe(0);
  });

  it('accumulates chunks without losing samples', () => {
    const acc = new PeakAccumulator(2, 100);
    acc.push(pcm([0, 32768]));
    acc.push(pcm([16384, 0]));
    expect(acc.finish()).toEqual([1, 0.5]);
  });

  it('downsamples to the requested width using the max', () => {
    expect(downsamplePeaks([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]);
    expect(downsamplePeaks([0.1, 0.2], 4)).toEqual([0.1, 0.2]);
  });

  it('returns an empty array for empty input', () => {
    expect(computePeaks(pcm([]), 10)).toEqual([]);
  });
});
