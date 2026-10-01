import { describe, it, expect, vi, afterEach } from 'vitest';
import { debounce } from '../debounce';

describe('debounce', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once after the quiet period', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of calls into one', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the latest arguments through', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced(1);
    debounced(2);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenLastCalledWith(2);
  });
});
