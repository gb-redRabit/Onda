// Parametryczny korektor: każde pasmo ma własny typ, częstotliwość i dobroć (Q) — nie tylko
// wzmocnienie jak w graficznym. Pasma są definiowane przez użytkownika (dodawane/usuwane).

import type { EqBand, EqBandType } from '@shared/types/audio';
import { EQ_LIMITS } from '@shared/eqSanitize';

export type { EqBand, EqBandType };
export { EQ_LIMITS };

/** Typowe częstotliwości korektora (tercje oktawy) — do „przyciągania". */
export const EQ_SNAP_FREQS = [
  20, 25, 31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
];

/** Najbliższa typowa częstotliwość, jeśli w tolerancji (%), inaczej oryginał. */
export function snapFrequency(freq: number, tolerancePct = 4): number {
  let best = freq;
  let bestDist = Infinity;
  for (const f of EQ_SNAP_FREQS) {
    const dist = Math.abs(f - freq);
    if (dist < bestDist) {
      bestDist = dist;
      best = f;
    }
  }
  return (bestDist / freq) * 100 <= tolerancePct ? best : freq;
}

/** Domyślny zestaw: półka niska, trzy peaki, półka wysoka — wszystkie neutralne. */
export const DEFAULT_EQ_BANDS: EqBand[] = [
  { type: 'lowshelf', frequency: 80, q: 0.7, gain: 0 },
  { type: 'peaking', frequency: 250, q: 1, gain: 0 },
  { type: 'peaking', frequency: 1000, q: 1, gain: 0 },
  { type: 'peaking', frequency: 4000, q: 1, gain: 0 },
  { type: 'highshelf', frequency: 10000, q: 0.7, gain: 0 }
];

function withGains(gains: number[]): EqBand[] {
  return DEFAULT_EQ_BANDS.map((b, i) => ({ ...b, gain: gains[i] ?? 0 }));
}

export const EQUALIZER_PRESETS: Record<string, EqBand[]> = {
  flat: withGains([0, 0, 0, 0, 0]),
  pop: withGains([-1, 2, 3, 2, 1]),
  rock: withGains([4, -1, -2, 3, 4]),
  jazz: withGains([3, 1, -1, 2, 3]),
  classical: withGains([3, 1, -1, 2, 4]),
  bassBoost: withGains([8, 4, 0, 0, 0]),
  trebleBoost: withGains([0, 0, 1, 5, 8]),
  vocal: withGains([-3, 1, 4, 3, -1])
};

export const EQUALIZER_PRESET_LABELS: Record<string, string> = {
  flat: 'Flat',
  pop: 'Pop',
  rock: 'Rock',
  jazz: 'Jazz',
  classical: 'Classical',
  bassBoost: 'Bass',
  trebleBoost: 'Treble',
  vocal: 'Vocal'
};

export function cloneEqBands(bands: readonly EqBand[]): EqBand[] {
  return bands.map((b) => ({ ...b }));
}

/** Wyraźny, powtarzalny kolor dla pasma (złoty kąt) — kropka na krzywej i wiersz mają ten sam. */
export function eqBandColor(index: number): string {
  return `hsl(${Math.round((index * 137.508) % 360)} 72% 62%)`;
}

/** Czy zestaw pasm odpowiada nazwanemu presetowi (po typie, częstotliwości, Q i gainie). */
export function matchesEqPreset(bands: readonly EqBand[], preset: readonly EqBand[]): boolean {
  if (bands.length !== preset.length) return false;
  return bands.every(
    (b, i) =>
      b.type === preset[i].type &&
      b.frequency === preset[i].frequency &&
      b.q === preset[i].q &&
      b.gain === preset[i].gain
  );
}
