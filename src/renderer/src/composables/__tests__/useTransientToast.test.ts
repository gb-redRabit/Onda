import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTransientToast } from '../useTransientToast';

describe('useTransientToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a toast and dismisses it after the duration', () => {
    const { toast, showToast } = useTransientToast(1000);

    showToast('queued');
    expect(toast.value).toEqual({ msg: 'queued', ok: true });

    vi.advanceTimersByTime(999);
    expect(toast.value).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(toast.value).toBeNull();
  });

  it('marks failures and replaces the previous toast, resetting the timer', () => {
    const { toast, showToast } = useTransientToast(1000);

    showToast('first');
    vi.advanceTimersByTime(800);
    showToast('second', false);

    expect(toast.value).toEqual({ msg: 'second', ok: false });
    // The first timer must not dismiss the replacement early.
    vi.advanceTimersByTime(800);
    expect(toast.value).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(toast.value).toBeNull();
  });

  it('dismiss clears the toast and the pending timer', () => {
    const { toast, showToast, dismiss } = useTransientToast(1000);

    showToast('bye');
    dismiss();
    expect(toast.value).toBeNull();

    vi.advanceTimersByTime(5000);
    expect(toast.value).toBeNull();
  });
});
