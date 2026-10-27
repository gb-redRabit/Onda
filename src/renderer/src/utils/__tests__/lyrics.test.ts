import { describe, expect, it } from 'vitest';
import {
  clampLyricsDelay,
  clampLyricsFontScale,
  findActiveLyricsLine,
  formatLyricsDelay,
  LYRICS_DELAY_MAX_MS,
  LYRICS_FONT_MAX,
  LYRICS_FONT_MIN
} from '../lyrics';

const lines = [
  { timeMs: 1000, text: 'one' },
  { timeMs: 3000, text: 'two' },
  { timeMs: 5000, text: 'three' }
];

describe('findActiveLyricsLine', () => {
  it('returns -1 before the first line', () => {
    expect(findActiveLyricsLine(lines, 0)).toBe(-1);
    expect(findActiveLyricsLine(lines, 999)).toBe(-1);
  });

  it('returns the last line whose time has passed', () => {
    expect(findActiveLyricsLine(lines, 1000)).toBe(0);
    expect(findActiveLyricsLine(lines, 2999)).toBe(0);
    expect(findActiveLyricsLine(lines, 3000)).toBe(1);
    expect(findActiveLyricsLine(lines, 9999)).toBe(2);
  });

  it('handles an empty list', () => {
    expect(findActiveLyricsLine([], 1000)).toBe(-1);
  });
});

describe('lyrics delay helpers', () => {
  it('clamps to the allowed range and rounds', () => {
    expect(clampLyricsDelay(123.7)).toBe(124);
    expect(clampLyricsDelay(999_999)).toBe(LYRICS_DELAY_MAX_MS);
    expect(clampLyricsDelay(-999_999)).toBe(-LYRICS_DELAY_MAX_MS);
    expect(clampLyricsDelay(Number.NaN)).toBe(0);
  });

  it('formats the offset with a sign', () => {
    expect(formatLyricsDelay(0)).toBe('0 ms');
    expect(formatLyricsDelay(150)).toBe('+150 ms');
    expect(formatLyricsDelay(-150)).toBe('\u2212150 ms');
  });

  it('clamps the font scale and rounds to 0.1', () => {
    expect(clampLyricsFontScale(1.234)).toBe(1.2);
    expect(clampLyricsFontScale(99)).toBe(LYRICS_FONT_MAX);
    expect(clampLyricsFontScale(0)).toBe(LYRICS_FONT_MIN);
    expect(clampLyricsFontScale(Number.NaN)).toBe(1);
  });
});
