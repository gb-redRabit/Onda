import type { LyricsLine } from '@shared/types/lyrics';

export const LYRICS_DELAY_STEP_MS = 50;
export const LYRICS_DELAY_COARSE_MS = 500;
export const LYRICS_DELAY_MAX_MS = 60_000;
export const LYRICS_FONT_MIN = 0.8;
export const LYRICS_FONT_MAX = 2;
export const LYRICS_FONT_STEP = 0.1;

export function clampLyricsFontScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(LYRICS_FONT_MIN, Math.min(LYRICS_FONT_MAX, Math.round(scale * 10) / 10));
}

export function clampLyricsDelay(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(-LYRICS_DELAY_MAX_MS, Math.min(LYRICS_DELAY_MAX_MS, Math.round(ms)));
}

export function formatLyricsDelay(ms: number): string {
  const sign = ms > 0 ? '+' : ms < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(ms)} ms`;
}

/**
 * Indeks ostatniej linii, której czas <= podany czas. `-1` przed pierwszą linią.
 * Linie muszą być posortowane rosnąco.
 */
export function findActiveLyricsLine(lines: readonly LyricsLine[], timeMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let answer = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].timeMs <= timeMs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return answer;
}
