import { ref } from 'vue';

// Przesunięcie czasowe napisów (Subtitle Delay / Offset). Dodatnia wartość = napisy
// pojawiają się PÓŹNIEJ (przesunięte w przyszłość) — zgodnie z intuicją „napisy +150 ms".
// JASSUB dodaje `timeOffset` do `mediaTime`, więc znak jest odwrócony (patrz
// `subtitleTimeOffsetSeconds`). Stan trzymany w pamięci sesji (nie jest zapisywany).

/** Krok pojedynczego naciśnięcia skrótu. */
export const SUBTITLE_DELAY_STEP_MS = 50;
/** Krok przy trzymanym Shift (zgrubne ustawienie). */
export const SUBTITLE_DELAY_COARSE_MS = 500;
/** Twardy limit w obie strony. */
export const SUBTITLE_DELAY_MAX_MS = 60_000;

export const subtitleDelayMs = ref(0);

export function clampSubtitleDelay(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(-SUBTITLE_DELAY_MAX_MS, Math.min(SUBTITLE_DELAY_MAX_MS, Math.round(ms)));
}

export function setSubtitleDelay(ms: number): number {
  subtitleDelayMs.value = clampSubtitleDelay(ms);
  return subtitleDelayMs.value;
}

export function adjustSubtitleDelay(deltaMs: number): number {
  return setSubtitleDelay(subtitleDelayMs.value + deltaMs);
}

export function resetSubtitleDelay(): number {
  return setSubtitleDelay(0);
}

/** Offset dla JASSUB (sekundy). Ujemny, bo renderer dostaje `mediaTime + offset`. */
export function subtitleTimeOffsetSeconds(ms: number = subtitleDelayMs.value): number {
  return -ms / 1000;
}

export function formatSubtitleDelay(ms: number): string {
  const sign = ms > 0 ? '+' : ms < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(ms)} ms`;
}
