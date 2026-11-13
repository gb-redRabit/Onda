import { afterEach, describe, expect, it, vi } from 'vitest';

import { downsamplePeaks, waveformColor, waveformPlayedColor } from '../waveform';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downsamplePeaks', () => {
  it('returns a copy when peaks already fit', () => {
    const peaks = [1, 2, 3];
    const result = downsamplePeaks(peaks, 5);

    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(peaks);
  });

  it('keeps the maximum of each bucket', () => {
    const peaks = [1, 9, 2, 3, 8, 1, 7, 0];
    const result = downsamplePeaks(peaks, 4);

    expect(result).toHaveLength(4);
    expect(result[0]).toBe(9);
    expect(result[1]).toBe(3);
    expect(result[2]).toBe(8);
  });

  it('handles fractional and tiny widths', () => {
    expect(downsamplePeaks([1, 2], 0)).toEqual([2]);
    expect(downsamplePeaks([1, 2, 3, 4], 2.8)).toHaveLength(2);
  });

  it('handles empty peaks and negative widths', () => {
    expect(downsamplePeaks([], 10)).toEqual([]);
    expect(downsamplePeaks([1], -1)).toEqual([1]);
  });
});

describe('waveform colors', () => {
  function mockStyle(values: Record<string, string>) {
    vi.stubGlobal(
      'getComputedStyle',
      vi.fn(() => ({
        getPropertyValue: (name: string) => values[name] ?? ''
      }))
    );
  }

  it('reads theme colors', () => {
    mockStyle({ '--color-base-content': ' #fff ', '--color-primary': '#123456' });

    expect(waveformColor()).toBe('#fff');
    expect(waveformPlayedColor()).toBe('#123456');
  });

  it('falls back to brand colors', () => {
    mockStyle({});

    expect(waveformColor()).toBe('#8b7cf0');
    expect(waveformPlayedColor()).toBe('#605dff');
  });
});
