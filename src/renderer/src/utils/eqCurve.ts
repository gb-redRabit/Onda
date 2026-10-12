import type { EqBand } from '@shared/types/audio';
import { biquadCoefficients, biquadMagnitudeDb } from './eqBiquad';

// Charakterystyka przenoszenia do rysunku — ta sama matematyka (RBJ) co w silniku,
// więc kropki pasm leżą na krzywej, a zmiana Q/nachylenia realnie zmienia kształt.

/** Wzmocnienie (dB) wypadkowe wszystkich pasm w danej częstotliwości. */
export function eqGainAt(freq: number, bands: readonly EqBand[]): number {
  let db = 0;
  for (const band of bands) {
    const c = biquadCoefficients(band);
    if (c) db += biquadMagnitudeDb(c, freq);
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
