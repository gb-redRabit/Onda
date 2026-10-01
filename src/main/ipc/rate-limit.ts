export interface RateLimiterOptions {
  /** Calls allowed per key inside the window. */
  maxCalls: number;
  windowMs: number;
  /** Injectable clock (tests). */
  now?: () => number;
}

export interface RateLimiter {
  tryAcquire(key: string): boolean;
  reset(key?: string): void;
}

/**
 * Sliding-window rate limiter keyed by an opaque string (e.g. sender+channel).
 * Used to stop a compromised renderer from hammering expensive IPC handlers
 * (library scan, duplicate hashing, installs) into exhausting CPU/disk.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { maxCalls, windowMs } = options;
  const now = options.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();

  function tryAcquire(key: string): boolean {
    const t = now();
    const cutoff = t - windowMs;
    const times = (hits.get(key) ?? []).filter((x) => x > cutoff);
    if (times.length >= maxCalls) {
      hits.set(key, times);
      return false;
    }
    times.push(t);
    hits.set(key, times);
    return true;
  }

  function reset(key?: string): void {
    if (key === undefined) hits.clear();
    else hits.delete(key);
  }

  return { tryAcquire, reset };
}
