export interface RateLimiterOptions {
  /** Liczba wywołań dozwolonych na klucz w oknie. */
  maxCalls: number;
  windowMs: number;
  /** Wstrzykiwalny zegar (testy). */
  now?: () => number;
}

export interface RateLimiter {
  tryAcquire(key: string): boolean;
  reset(key?: string): void;
}

/**
 * Rate limiter ze ślizgającym się oknem, kluczowany nieprzezroczystym stringiem (np. nadawca+kanał).
 * Używany, aby przejęty renderer nie bombardował kosztownych handlerów IPC
 * (skan biblioteki, hashowanie duplikatów, instalacje), doprowadzając do wyczerpania CPU/dysku.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { maxCalls, windowMs } = options;
  const now = options.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();
  // Klucz to nadawca+kanał — bez przycinania mapy rosłaby o każdy (okno × kanał)
  // przez cały czas życia procesu. Okresowo usuwamy wpisy bez aktywnych trafień.
  let lastSweep = 0;
  const SWEEP_INTERVAL_MS = windowMs;

  function sweep(t: number): void {
    if (t - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = t;
    const cutoff = t - windowMs;
    for (const [key, times] of hits) {
      const kept = times.filter((x) => x > cutoff);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  }

  function tryAcquire(key: string): boolean {
    const t = now();
    sweep(t);
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
