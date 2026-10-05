import { describe, it, expect } from 'vitest';
import { isWithinWindow, msUntilWindowStart } from '../schedule';

describe('isWithinWindow', () => {
  it('is always allowed when start equals end', () => {
    expect(isWithinWindow(3, 0, 0)).toBe(true);
  });

  it('allows hours inside a non-wrapping window', () => {
    expect(isWithinWindow(22, 22, 6)).toBe(true);
    expect(isWithinWindow(23, 22, 6)).toBe(true);
    expect(isWithinWindow(0, 22, 6)).toBe(true);
    expect(isWithinWindow(5, 22, 6)).toBe(true);
  });

  it('blocks hours outside a wrapping window', () => {
    expect(isWithinWindow(6, 22, 6)).toBe(false);
    expect(isWithinWindow(12, 22, 6)).toBe(false);
  });

  it('allows hours inside a non-wrapping window', () => {
    expect(isWithinWindow(10, 8, 16)).toBe(true);
    expect(isWithinWindow(7, 8, 16)).toBe(false);
    expect(isWithinWindow(16, 8, 16)).toBe(false);
  });
});

describe('msUntilWindowStart', () => {
  it('returns 0 when the schedule is disabled (start === end)', () => {
    expect(msUntilWindowStart(0, 0, new Date('2026-10-04T12:00:00'))).toBe(0);
  });

  it('counts to a later start the same day', () => {
    // 12:00 -> 22:00 = 10h
    expect(msUntilWindowStart(22, 6, new Date('2026-10-04T12:00:00'))).toBe(10 * 3600_000);
  });

  it('rolls over to the next day when the start already passed', () => {
    // 23:30 -> następne 08:00 = 8.5h
    expect(msUntilWindowStart(8, 16, new Date('2026-10-04T23:30:00'))).toBe(8.5 * 3600_000);
  });
});
