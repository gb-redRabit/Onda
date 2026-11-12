import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  hold: { until: 0 } as { until: number },
  pump: vi.fn(async () => undefined)
}));

vi.mock('../download-state', () => ({ hold: h.hold }));
vi.mock('../download-runner', () => ({ pump: h.pump }));

import { getScheduledStart, scheduleDownloadStart } from '../download-schedule';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
  h.hold.until = 0;
  h.pump.mockClear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('scheduleDownloadStart', () => {
  it('clears the hold and pumps immediately when the schedule is removed', () => {
    h.hold.until = 123;

    expect(scheduleDownloadStart(null)).toBe(true);

    expect(h.hold.until).toBe(0);
    expect(h.pump).toHaveBeenCalledTimes(1);
    expect(getScheduledStart()).toBeNull();
  });

  it('pumps immediately for a past timestamp', () => {
    const past = Date.now() - 1_000;

    expect(scheduleDownloadStart(past)).toBe(true);

    expect(h.hold.until).toBe(0);
    expect(h.pump).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds until a future timestamp and pumps when it arrives', () => {
    const when = Date.now() + 5_000;

    expect(scheduleDownloadStart(when)).toBe(true);

    expect(h.hold.until).toBe(when);
    expect(getScheduledStart()).toBe(when);
    expect(h.pump).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4_999);
    expect(h.pump).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(h.pump).toHaveBeenCalledTimes(1);
    expect(h.hold.until).toBe(0);
    expect(getScheduledStart()).toBeNull();
  });

  it('replaces an earlier timer when rescheduled', () => {
    scheduleDownloadStart(Date.now() + 5_000);
    scheduleDownloadStart(Date.now() + 10_000);

    vi.advanceTimersByTime(5_000);
    expect(h.pump).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5_000);
    expect(h.pump).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending timer when the schedule is cleared', () => {
    scheduleDownloadStart(Date.now() + 5_000);
    scheduleDownloadStart(null);

    vi.advanceTimersByTime(10_000);

    expect(h.pump).toHaveBeenCalledTimes(1);
  });
});

describe('getScheduledStart', () => {
  it('returns null when no hold is active', () => {
    expect(getScheduledStart()).toBeNull();
    h.hold.until = 42;
    expect(getScheduledStart()).toBe(42);
  });
});
