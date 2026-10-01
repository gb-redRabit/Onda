import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout, TimeoutError } from '../with-timeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 100)).resolves.toBe(42);
  });

  it('propagates a rejection unchanged', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 100)).rejects.toThrow('boom');
  });

  it('rejects with a TimeoutError once the deadline passes', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const pending = withTimeout(never, 50);
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    vi.advanceTimersByTime(50);
    await assertion;
  });
});
