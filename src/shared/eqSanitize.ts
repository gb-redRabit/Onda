// Wspólny model granic i sanityzacji parametrycznego korektora. Jedno źródło prawdy
// używane przez proces główny (persystencja `settings:set`/`import`) ORAZ renderer
// (import z schowka) — wcześniej każda warstwa miała własne zakresy, więc import
// nieprzefiltrowanego JSON-a mógł wprowadzić `Infinity`/setki pasm do żywego grafu.

import type { EqBand, EqBandType } from './types/audio';

export const EQ_LIMITS = {
  minFrequency: 20,
  maxFrequency: 20000,
  minQ: 0.3,
  maxQ: 8,
  minGain: -18,
  maxGain: 18,
  minSlope: 0.3,
  maxSlope: 2,
  minPreamp: -12,
  maxPreamp: 12,
  maxBands: 12
} as const;

const EQ_TYPES: readonly EqBandType[] = ['lowshelf', 'peaking', 'highshelf'];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Sanityzuje jedno pasmo; zwraca `null`, gdy brak wymaganego typu lub którejś z liczb. */
export function sanitizeEqBand(v: unknown): EqBand | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const type = EQ_TYPES.includes(r.type as EqBandType) ? (r.type as EqBandType) : null;
  const frequency = finite(r.frequency);
  const q = finite(r.q);
  const gain = finite(r.gain);
  if (!type || frequency === null || q === null || gain === null) return null;
  const band: EqBand = {
    type,
    frequency: clamp(frequency, EQ_LIMITS.minFrequency, EQ_LIMITS.maxFrequency),
    q: clamp(q, EQ_LIMITS.minQ, EQ_LIMITS.maxQ),
    gain: clamp(gain, EQ_LIMITS.minGain, EQ_LIMITS.maxGain)
  };
  const slope = finite(r.slope);
  if (slope !== null) band.slope = clamp(slope, EQ_LIMITS.minSlope, EQ_LIMITS.maxSlope);
  if (typeof r.enabled === 'boolean') band.enabled = r.enabled;
  return band;
}

/** Zwraca maks. `EQ_LIMITS.maxBands` poprawnych pasm albo `undefined`, gdy wejście nie jest tablicą. */
export function sanitizeEqBands(v: unknown): EqBand[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: EqBand[] = [];
  for (const item of v) {
    if (out.length >= EQ_LIMITS.maxBands) break;
    const band = sanitizeEqBand(item);
    if (band) out.push(band);
  }
  return out;
}

/** Clampuje preamp do dozwolonego zakresu; `undefined` dla wartości nieliczbowej. */
export function sanitizeEqPreamp(v: unknown): number | undefined {
  const n = finite(v);
  return n === null ? undefined : clamp(n, EQ_LIMITS.minPreamp, EQ_LIMITS.maxPreamp);
}
