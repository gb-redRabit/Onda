import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EQ_BANDS,
  EQUALIZER_PRESETS,
  EQ_LIMITS,
  cloneEqBands,
  matchesEqPreset
} from '../audio';

describe('parametric EQ model', () => {
  it('default bands are neutral and span low shelf -> peaks -> high shelf', () => {
    expect(DEFAULT_EQ_BANDS.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_EQ_BANDS[0].type).toBe('lowshelf');
    expect(DEFAULT_EQ_BANDS[DEFAULT_EQ_BANDS.length - 1].type).toBe('highshelf');
    expect(DEFAULT_EQ_BANDS.every((b) => b.gain === 0)).toBe(true);
  });

  it('cloneEqBands deep-copies so edits do not mutate the source', () => {
    const copy = cloneEqBands(DEFAULT_EQ_BANDS);
    copy[0].gain = 5;
    copy[0].frequency = 123;
    expect(DEFAULT_EQ_BANDS[0].gain).toBe(0);
    expect(DEFAULT_EQ_BANDS[0].frequency).not.toBe(123);
  });

  it('every preset uses the same bands as the default set', () => {
    for (const bands of Object.values(EQUALIZER_PRESETS)) {
      expect(bands).toHaveLength(DEFAULT_EQ_BANDS.length);
    }
  });

  it('matchesEqPreset compares type, frequency, q and gain', () => {
    expect(matchesEqPreset(EQUALIZER_PRESETS.flat, EQUALIZER_PRESETS.flat)).toBe(true);
    expect(matchesEqPreset(EQUALIZER_PRESETS.flat, EQUALIZER_PRESETS.rock)).toBe(false);
    const tweaked = cloneEqBands(EQUALIZER_PRESETS.flat);
    tweaked[0].gain = 3;
    expect(matchesEqPreset(tweaked, EQUALIZER_PRESETS.flat)).toBe(false);
  });

  it('exposes wider, parametryczne limits', () => {
    expect(EQ_LIMITS.minGain).toBeLessThan(0);
    expect(EQ_LIMITS.maxGain).toBeGreaterThan(0);
    expect(EQ_LIMITS.minQ).toBeLessThan(EQ_LIMITS.maxQ);
    expect(EQ_LIMITS.maxBands).toBeGreaterThan(DEFAULT_EQ_BANDS.length);
  });
});
