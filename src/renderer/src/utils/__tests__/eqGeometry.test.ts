import { describe, it, expect } from 'vitest';
import { EQ_CURVE, dbToY, bandX, bandY, markerRadius, gainPct } from '../eqGeometry';

describe('eqGeometry', () => {
  it('maps 0 dB to the vertical middle and clamps out-of-range gains', () => {
    expect(dbToY(0)).toBe(EQ_CURVE.height / 2);
    expect(dbToY(100)).toBe(0);
    expect(dbToY(-100)).toBe(EQ_CURVE.height);
  });

  it('maps 0 dB to 50% band height', () => {
    expect(bandY(0)).toBe(50);
    expect(bandY(EQ_CURVE.maxDb)).toBe(0);
    expect(bandY(EQ_CURVE.minDb)).toBe(100);
  });

  it('maps the frequency range to 0–100%', () => {
    expect(bandX(EQ_CURVE.minFreq)).toBe(0);
    expect(bandX(EQ_CURVE.maxFreq)).toBeCloseTo(100);
  });

  it('selects the marker shape by band type', () => {
    expect(markerRadius('lowshelf')).toContain('18% 18%');
    expect(markerRadius('highshelf')).toContain('50% 50%');
    expect(markerRadius('peaking')).toBe('50%');
  });

  it('maps gain to a 0–100% slider position', () => {
    expect(gainPct(-6, -12, 12)).toBe(25);
    expect(gainPct(0, -12, 12)).toBe(50);
    expect(gainPct(12, -12, 12)).toBe(100);
  });
});
