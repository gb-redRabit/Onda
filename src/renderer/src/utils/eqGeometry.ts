import type { EqBandType } from '@renderer/utils/constants/audio';
import { freqToRatio } from '@renderer/utils/eqCurve';

// Czysta geometria wykresu korektora: rozmiar, siatka i przeliczenia
// częstotliwość/gain → pozycja na wykresie. Wydzielone z `Equalizer.vue` (plan 2.8),
// żeby SFC trzymał tylko UI, a przeliczenia były testowalne bez montowania.

export interface EqCurveGeometry {
  width: number;
  height: number;
  minFreq: number;
  maxFreq: number;
  minDb: number;
  maxDb: number;
}

export const EQ_CURVE: EqCurveGeometry = {
  width: 480,
  height: 110,
  minFreq: 20,
  maxFreq: 20000,
  minDb: -18,
  maxDb: 18
};

/** Liczba słupków spektrum. */
export const SPECTRUM_BARS = 48;
/** Pionowe linie siatki (Hz). */
export const EQ_GRID_FREQS = [100, 1000, 10000];
/** Poziome linie siatki (dB). */
export const EQ_GRID_DBS = [-12, -6, 6, 12];

/** dB → współrzędna Y w pikselach (0 = góra). */
export function dbToY(db: number, g: EqCurveGeometry = EQ_CURVE): number {
  const clamped = Math.max(g.minDb, Math.min(g.maxDb, db));
  return g.height - ((clamped - g.minDb) / (g.maxDb - g.minDb)) * g.height;
}

/** Częstotliwość → pozycja X w procentach (0–100). */
export function bandX(freq: number, g: EqCurveGeometry = EQ_CURVE): number {
  return freqToRatio(freq, g.minFreq, g.maxFreq) * 100;
}

/** Gain → pozycja Y w procentach (0 = góra). */
export function bandY(gain: number, g: EqCurveGeometry = EQ_CURVE): number {
  const clamped = Math.max(g.minDb, Math.min(g.maxDb, gain));
  return ((g.maxDb - clamped) / (g.maxDb - g.minDb)) * 100;
}

/** Kształt markera pasma zależny od typu filtra. */
export function markerRadius(type: EqBandType): string {
  return type === 'lowshelf' ? '50% 50% 18% 18%' : type === 'highshelf' ? '18% 18% 50% 50%' : '50%';
}

/** Gain → procent zakresu suwaka (0–100). */
export function gainPct(gain: number, minGain: number, maxGain: number): number {
  return ((gain - minGain) / (maxGain - minGain)) * 100;
}
