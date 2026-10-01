import { describe, it, expect, vi, afterEach } from 'vitest';
import { startBootWatchdog } from '../boot-watchdog';

afterEach(() => {
  vi.useRealTimers();
});

describe('startBootWatchdog', () => {
  it('stops without timeout once the renderer is ready', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    startBootWatchdog({
      isRendererReady: () => true,
      onTimeout,
      intervalMs: 100,
      deadlineMs: 300
    });

    vi.advanceTimersByTime(1000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('fires once at the deadline when never ready', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    startBootWatchdog({
      isRendererReady: () => false,
      onTimeout,
      intervalMs: 100,
      deadlineMs: 300
    });

    vi.advanceTimersByTime(299);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    // And it does not keep firing afterwards.
    vi.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('can be stopped before the deadline', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const stop = startBootWatchdog({
      isRendererReady: () => false,
      onTimeout,
      intervalMs: 100,
      deadlineMs: 1000
    });

    stop();
    vi.advanceTimersByTime(2000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
