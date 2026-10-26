import { describe, expect, it } from 'vitest';
import { downsamplePeaks } from '../waveform';

describe('renderer waveform downsampling', () => {
  it('uses the loudest value in each output column', () => {
    expect(downsamplePeaks([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]);
  });

  it('keeps short arrays unchanged', () => {
    expect(downsamplePeaks([0.4, 0.6], 5)).toEqual([0.4, 0.6]);
  });

  it('always returns at least one column', () => {
    expect(downsamplePeaks([0.5], 0)).toEqual([0.5]);
  });
});
