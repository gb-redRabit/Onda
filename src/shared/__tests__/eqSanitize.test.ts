import { describe, expect, it } from 'vitest';
import { EQ_LIMITS, sanitizeEqBand, sanitizeEqBands, sanitizeEqPreamp } from '../eqSanitize';

describe('sanitizeEqBands', () => {
  it('clamps out-of-range values and drops invalid entries', () => {
    const bands = sanitizeEqBands([
      { type: 'peaking', frequency: 1000, q: 1, gain: 0 },
      { type: 'peaking', frequency: 999999, q: 99, gain: 99 },
      { type: 'bogus', frequency: 1, q: 1, gain: 1 },
      { type: 'peaking', frequency: Number.POSITIVE_INFINITY, q: 1, gain: 1 },
      'nope'
    ]);
    expect(bands).toHaveLength(2);
    expect(bands![1]).toMatchObject({
      frequency: EQ_LIMITS.maxFrequency,
      q: EQ_LIMITS.maxQ,
      gain: EQ_LIMITS.maxGain
    });
  });

  it('caps the band count at maxBands', () => {
    const many = Array.from({ length: 50 }, () => ({
      type: 'peaking',
      frequency: 1000,
      q: 1,
      gain: 0
    }));
    expect(sanitizeEqBands(many)).toHaveLength(EQ_LIMITS.maxBands);
  });

  it('returns undefined for non-arrays', () => {
    expect(sanitizeEqBands('x')).toBeUndefined();
    expect(sanitizeEqBands(null)).toBeUndefined();
    expect(sanitizeEqBands({})).toBeUndefined();
  });

  it('preserves slope and enabled when present', () => {
    const bands = sanitizeEqBands([
      { type: 'lowshelf', frequency: 80, q: 0.7, gain: 3, slope: 1.5, enabled: false }
    ]);
    expect(bands![0]).toMatchObject({ slope: 1.5, enabled: false });
  });
});

describe('sanitizeEqPreamp', () => {
  it('clamps into range and rejects non-finite numbers', () => {
    expect(sanitizeEqPreamp(50)).toBe(EQ_LIMITS.maxPreamp);
    expect(sanitizeEqPreamp(-50)).toBe(EQ_LIMITS.minPreamp);
    expect(sanitizeEqPreamp('3')).toBeUndefined();
    expect(sanitizeEqPreamp(Number.NaN)).toBeUndefined();
  });
});

describe('sanitizeEqBand', () => {
  it('rejects bands missing required numeric fields', () => {
    expect(sanitizeEqBand({ type: 'peaking', frequency: 1000 })).toBeNull();
    expect(sanitizeEqBand({ type: 'peaking', frequency: 1000, q: 1, gain: 'x' })).toBeNull();
    expect(sanitizeEqBand(null)).toBeNull();
  });
});
