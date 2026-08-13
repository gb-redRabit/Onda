import { describe, it, expect } from 'vitest';
import { isWithinWindow } from '../schedule';

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
