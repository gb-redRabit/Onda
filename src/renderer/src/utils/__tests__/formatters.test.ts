import { describe, it, expect } from 'vitest';
import { formatDuration, formatFileSize, formatNumber } from '../formatters';

describe('formatDuration', () => {
  it('returns 0:00 for null/NaN/undefined', () => {
    expect(formatDuration(0 as any)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(null as any)).toBe('0:00');
    expect(formatDuration(undefined as any)).toBe('0:00');
  });

  it('formats seconds only', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(59)).toBe('0:59');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(61)).toBe('1:01');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(86399)).toBe('23:59:59');
  });
});

describe('formatFileSize', () => {
  it('returns 0 B for zero', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatFileSize(100)).toBe('100 B');
  });

  it('formats KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats MB', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('formats GB', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });
});

describe('formatNumber', () => {
  it('formats numbers below 1000', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands', () => {
    expect(formatNumber(1000)).toBe('1.0K');
    expect(formatNumber(1500)).toBe('1.5K');
  });

  it('formats millions', () => {
    expect(formatNumber(1000000)).toBe('1.0M');
    expect(formatNumber(2500000)).toBe('2.5M');
  });

  it('formats billions', () => {
    expect(formatNumber(1000000000)).toBe('1.0B');
  });

  it('handles string input', () => {
    expect(formatNumber('1500')).toBe('1.5K');
    expect(formatNumber('abc')).toBe('0');
  });
});

describe('formatDuration edge cases', () => {
  it('handles negative values (clamped to 0)', () => {
    expect(formatDuration(-1)).toBe('0:00');
  });

  it('handles very large values', () => {
    expect(formatDuration(3600 * 48 + 3661)).toBe('49:01:01');
  });
});

describe('formatFileSize edge cases', () => {
  it('handles TB values', () => {
    expect(formatFileSize(1099511627776)).toBe('1.0 TB');
  });

  it('handles exact KB boundary', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('handles negative values (clamped to 0)', () => {
    expect(formatFileSize(-1)).toBe('0 B');
  });

  it('handles fractional bytes (float input)', () => {
    expect(formatFileSize(0.5)).toBe('< 1 B');
  });
});

describe('formatNumber edge cases', () => {
  it('handles negative numbers (no abbreviation for negative)', () => {
    expect(formatNumber(-500)).toBe('-500');
    expect(formatNumber(-1500)).toBe('-1500');
  });

  it('handles very large numbers', () => {
    expect(formatNumber(1000000000000)).toBe('1000.0B');
  });

  it('handles NaN string', () => {
    expect(formatNumber('not a number')).toBe('0');
  });

  it('handles empty string', () => {
    expect(formatNumber('')).toBe('0');
  });
});
