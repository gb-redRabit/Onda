import type { EqBand } from '@shared/types/audio';

// Współczynniki biquada RBJ (peaking / low-shelf / high-shelf) — wspólne dla WIZUALIZACJI
// (krzywa) i DŹWIĘKU (półki jako IIRFilterNode z regulowanym nachyleniem S; biquad Web Audio
// ma stałe S=1). Pasmo neutralne (gain 0 lub wyłączone) zwraca `null`.

export const DEFAULT_FS = 48000;

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

export function biquadCoefficients(band: EqBand, fs = DEFAULT_FS): BiquadCoefficients | null {
  if (band.gain === 0 || band.enabled === false) return null;
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * band.frequency) / fs;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);

  if (band.type === 'peaking') {
    const alpha = sinW0 / (2 * Math.max(0.1, band.q));
    return {
      b0: 1 + alpha * A,
      b1: -2 * cosW0,
      b2: 1 - alpha * A,
      a0: 1 + alpha / A,
      a1: -2 * cosW0,
      a2: 1 - alpha / A
    };
  }

  // Nachylenie półki S (S=1 najostrzejsze bez przesterowania; S<1 łagodniejsze).
  const S = Math.max(0.1, band.slope ?? 1);
  const alphaTerm = (A + 1 / A) * (1 / S - 1) + 2;
  const alpha = (sinW0 / 2) * Math.sqrt(Math.max(0, alphaTerm));
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

  if (band.type === 'lowshelf') {
    return {
      b0: A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha),
      b1: 2 * A * (A - 1 - (A + 1) * cosW0),
      b2: A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha),
      a0: A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha,
      a1: -2 * (A - 1 + (A + 1) * cosW0),
      a2: A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha
    };
  }
  return {
    b0: A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha),
    b1: -2 * A * (A - 1 + (A + 1) * cosW0),
    b2: A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha),
    a0: A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha,
    a1: 2 * (A - 1 - (A + 1) * cosW0),
    a2: A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha
  };
}

export function biquadMagnitudeDb(c: BiquadCoefficients, freq: number, fs = DEFAULT_FS): number {
  const w = (2 * Math.PI * freq) / fs;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const nRe = c.b0 + c.b1 * cosW + c.b2 * cos2;
  const nIm = -(c.b1 * sinW + c.b2 * sin2);
  const dRe = c.a0 + c.a1 * cosW + c.a2 * cos2;
  const dIm = -(c.a1 * sinW + c.a2 * sin2);
  return 20 * Math.log10(Math.hypot(nRe, nIm) / (Math.hypot(dRe, dIm) || 1e-9));
}

/** Znormalizowane tablice dla `IIRFilterNode` (pasmo neutralne = przepust). */
export function iirCoefficients(
  band: EqBand,
  fs = DEFAULT_FS
): { feedforward: number[]; feedback: number[] } {
  const c = biquadCoefficients(band, fs);
  if (!c) return { feedforward: [1, 0, 0], feedback: [1, 0, 0] };
  return {
    feedforward: [c.b0 / c.a0, c.b1 / c.a0, c.b2 / c.a0],
    feedback: [1, c.a1 / c.a0, c.a2 / c.a0]
  };
}
