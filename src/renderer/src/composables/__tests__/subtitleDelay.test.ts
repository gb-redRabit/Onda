import { describe, it, expect, beforeEach } from 'vitest';
import {
  subtitleDelayMs,
  setSubtitleDelay,
  adjustSubtitleDelay,
  resetSubtitleDelay,
  clampSubtitleDelay,
  subtitleTimeOffsetSeconds,
  formatSubtitleDelay,
  SUBTITLE_DELAY_STEP_MS,
  SUBTITLE_DELAY_MAX_MS
} from '../subtitleDelay';

describe('subtitle delay', () => {
  beforeEach(() => {
    resetSubtitleDelay();
  });

  it('clamps to the hard limit and rounds', () => {
    expect(clampSubtitleDelay(999999)).toBe(SUBTITLE_DELAY_MAX_MS);
    expect(clampSubtitleDelay(-999999)).toBe(-SUBTITLE_DELAY_MAX_MS);
    expect(clampSubtitleDelay(49.6)).toBe(50);
    expect(clampSubtitleDelay(Number.NaN)).toBe(0);
  });

  it('accumulates steps', () => {
    expect(adjustSubtitleDelay(SUBTITLE_DELAY_STEP_MS)).toBe(50);
    expect(adjustSubtitleDelay(SUBTITLE_DELAY_STEP_MS)).toBe(100);
    expect(subtitleDelayMs.value).toBe(100);
  });

  it('maps a positive delay (later subtitles) to a negative JASSUB offset', () => {
    setSubtitleDelay(150);
    expect(subtitleTimeOffsetSeconds()).toBe(-0.15);
    setSubtitleDelay(-250);
    expect(subtitleTimeOffsetSeconds()).toBe(0.25);
  });

  it('formats the delay for the on-screen indicator', () => {
    expect(formatSubtitleDelay(150)).toBe('+150 ms');
    expect(formatSubtitleDelay(-150)).toBe('\u2212150 ms');
    expect(formatSubtitleDelay(0)).toBe('0 ms');
  });
});
