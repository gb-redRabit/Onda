import type { EqBand } from '@shared/types/audio';

// Przybliżona charakterystyka przenoszenia dla rysunku: peak = dzwon w dB wokół f0
// (szerokość ~ 1/Q), półki = łagodne przejście. Nie jest to dokładny wzór RBJ — służy
// wyłącznie wizualizacji; rzeczywisty dźwięk liczy Web Audio.

const PEAK_WIDTH_SCALE = 1.2;

/** Wzmocnienie (dB) wypadkowe wszystkich pasm w danej częstotliwości. */
export function eqGainAt(freq: number, bands: readonly EqBand[]): number {
  let db = 0;
  for (const b of bands) {
    if (b.type === 'peaking') {
      const octaves = Math.log2(freq / b.frequency);
      const width = PEAK_WIDTH_SCALE / Math.max(0.3, b.q);
      db += b.gain * Math.exp(-(octaves * octaves) / (2 * width * width));
    } else if (b.type === 'lowshelf') {
      db += b.gain / (1 + Math.pow(freq / b.frequency, 4));
    } else {
      db += b.gain / (1 + Math.pow(b.frequency / freq, 4));
    }
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

/** Ścieżka SVG (jedna linia) charakterystyki; oś X logarytmiczna, oś Y liniowa w dB. */
export function eqCurvePath(bands: readonly EqBand[], geo: EqCurveGeometry): string {
  const { width, height, minFreq, maxFreq, minDb, maxDb } = geo;
  const steps = 100;
  const logMin = Math.log10(minFreq);
  const logSpan = Math.log10(maxFreq) - logMin;
  const dbSpan = maxDb - minDb;
  const y = (db: number) =>
    height - ((Math.max(minDb, Math.min(maxDb, db)) - minDb) / dbSpan) * height;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const freq = Math.pow(10, logMin + (i / steps) * logSpan);
    points.push(`${x.toFixed(2)},${y(eqGainAt(freq, bands)).toFixed(2)}`);
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
