import { describe, it, expect } from 'vitest';
import type { EqBand } from '@shared/types/audio';
import { eqGainAt, eqCurvePath, freqToRatio, ratioToFreq } from '../eqCurve';

const band = (over: Partial<EqBand>): EqBand => ({
  type: 'peaking',
  frequency: 1000,
  q: 1,
  gain: 0,
  ...over
});

const GEO = { width: 100, height: 50, minFreq: 20, maxFreq: 20000, minDb: -18, maxDb: 18 };

describe('eqCurve', () => {
  it('neutral bands give 0 dB everywhere', () => {
    expect(eqGainAt(100, [band({})])).toBeCloseTo(0, 5);
    expect(eqGainAt(10000, [band({})])).toBeCloseTo(0, 5);
  });

  it('a peaking band peaks at its frequency', () => {
    const bands = [band({ frequency: 1000, gain: 6 })];
    expect(eqGainAt(1000, bands)).toBeCloseTo(6, 5);
    expect(eqGainAt(1000, bands)).toBeGreaterThan(eqGainAt(4000, bands));
  });

  it('shelves ramp at the extremes', () => {
    const low = [band({ type: 'lowshelf', frequency: 100, gain: 6 })];
    expect(eqGainAt(20, low)).toBeGreaterThan(eqGainAt(2000, low));
    const high = [band({ type: 'highshelf', frequency: 8000, gain: 6 })];
    expect(eqGainAt(16000, high)).toBeGreaterThan(eqGainAt(200, high));
  });

  it('freqToRatio / ratioToFreq round-trip on the log axis', () => {
    expect(freqToRatio(20, 20, 20000)).toBeCloseTo(0, 5);
    expect(freqToRatio(20000, 20, 20000)).toBeCloseTo(1, 5);
    const r = freqToRatio(1000, 20, 20000);
    expect(ratioToFreq(r, 20, 20000)).toBeCloseTo(1000, 1);
  });

  it('builds an SVG path', () => {
    const path = eqCurvePath([band({ gain: 3 })], GEO);
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain(' L ');
  });
});
