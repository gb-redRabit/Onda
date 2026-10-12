import type { EqBand } from '@shared/types/audio';

// Dokładna charakterystyka przenoszenia (wzory RBJ) — ta sama matematyka co Web Audio, więc
// kropki pasm leżą na krzywej, a zmiana Q realnie poszerza/zwęża peak.

const FS = 48000;

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

/** Współczynniki biquada dla pasma; `null` gdy pasmo jest neutralne (gain 0). */
function biquad(band: EqBand): Biquad | null {
  if (band.gain === 0) return null;
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * band.frequency) / FS;
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

  const alpha = (sinW0 / 2) * Math.SQRT2; // nachylenie półki S = 1
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
  // highshelf
  return {
    b0: A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha),
    b1: -2 * A * (A - 1 + (A + 1) * cosW0),
    b2: A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha),
    a0: A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha,
    a1: 2 * (A - 1 - (A + 1) * cosW0),
    a2: A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha
  };
}

function magnitudeDb(bq: Biquad, freq: number): number {
  const w = (2 * Math.PI * freq) / FS;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const nRe = bq.b0 + bq.b1 * cosW + bq.b2 * cos2;
  const nIm = -(bq.b1 * sinW + bq.b2 * sin2);
  const dRe = bq.a0 + bq.a1 * cosW + bq.a2 * cos2;
  const dIm = -(bq.a1 * sinW + bq.a2 * sin2);
  const num = Math.hypot(nRe, nIm);
  const den = Math.hypot(dRe, dIm) || 1e-9;
  return 20 * Math.log10(num / den);
}

/** Wzmocnienie (dB) wypadkowe wszystkich pasm w danej częstotliwości. */
export function eqGainAt(freq: number, bands: readonly EqBand[]): number {
  let db = 0;
  for (const band of bands) {
    const bq = biquad(band);
    if (bq) db += magnitudeDb(bq, freq);
  }
  return db;
}

export interface EqCurveGeometry {
  width: number;
  height: number;
  minFreq: number;
  maxFreq: number;
  minDb: number;
  maxDb: number;
}

/** Ścieżka SVG (jedna linia) charakterystyki; oś X logarytmiczna, oś Y liniowa w dB.
 *  `offsetDb` (np. preamp) przesuwa całą charakterystykę w pionie. */
export function eqCurvePath(bands: readonly EqBand[], geo: EqCurveGeometry, offsetDb = 0): string {
  const { width, height, minFreq, maxFreq, minDb, maxDb } = geo;
  const steps = 120;
  const logMin = Math.log10(minFreq);
  const logSpan = Math.log10(maxFreq) - logMin;
  const dbSpan = maxDb - minDb;
  const y = (db: number) =>
    height - ((Math.max(minDb, Math.min(maxDb, db)) - minDb) / dbSpan) * height;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const freq = Math.pow(10, logMin + (i / steps) * logSpan);
    points.push(`${x.toFixed(2)},${y(eqGainAt(freq, bands) + offsetDb).toFixed(2)}`);
  }
  return `M ${points.join(' L ')}`;
}

/** Pozycja X (0..1) dla częstotliwości na osi logarytmicznej. */
export function freqToRatio(freq: number, minFreq: number, maxFreq: number): number {
  const logMin = Math.log10(minFreq);
  return (Math.log10(freq) - logMin) / (Math.log10(maxFreq) - logMin);
}

/** Częstotliwość dla pozycji X (0..1) na osi logarytmicznej. */
export function ratioToFreq(ratio: number, minFreq: number, maxFreq: number): number {
  const logMin = Math.log10(minFreq);
  return Math.pow(10, logMin + ratio * (Math.log10(maxFreq) - logMin));
}
