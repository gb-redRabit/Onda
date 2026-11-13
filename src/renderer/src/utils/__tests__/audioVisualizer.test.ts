import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS, VIZ_CYCLES, nextVizMode, qualityPreset } from '../audioVisualizer';

// Statyczne dane wizualizera: cykl trybów i presety jakości.

describe('qualityPreset', () => {
  it('returns the requested preset', () => {
    expect(qualityPreset('low')).toBe(QUALITY_PRESETS.low);
    expect(qualityPreset('medium')).toBe(QUALITY_PRESETS.medium);
    expect(qualityPreset('high')).toBe(QUALITY_PRESETS.high);
  });

  it('defaults to high for missing or unknown presets', () => {
    expect(qualityPreset(undefined)).toBe(QUALITY_PRESETS.high);
    expect(qualityPreset('ultra')).toBe(QUALITY_PRESETS.high);
  });
});

describe('nextVizMode', () => {
  it('cycles through every mode and wraps around', () => {
    for (let i = 0; i < VIZ_CYCLES.length; i++) {
      const current = VIZ_CYCLES[i]!;
      expect(nextVizMode(current)).toBe(VIZ_CYCLES[(i + 1) % VIZ_CYCLES.length]);
    }
    expect(nextVizMode(VIZ_CYCLES.at(-1))).toBe(VIZ_CYCLES[0]);
  });

  it('starts from the first mode for unknown or missing values', () => {
    expect(nextVizMode(undefined)).toBe(VIZ_CYCLES[0]);
    expect(nextVizMode('bogus')).toBe(VIZ_CYCLES[0]);
  });

  it('starts at the first mode after the last one', () => {
    expect(VIZ_CYCLES[0]).toBe('splash');
    expect(nextVizMode('none')).toBe('splash');
  });
});
