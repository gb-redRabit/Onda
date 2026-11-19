/**
 * Prosty limiter współbieżności (FIFO). Używany dla operacji, które spawnują
 * procesy lub otwierają wiele plików naraz: `Promise.all` bez globalnego limitu
 * mnoży współbieżność przez głębokość rekurencji (EMFILE/CPU).
 */
export interface Limiter {
  <T>(task: () => Promise<T>): Promise<T>;
  active(): number;
  pending(): number;
}

export function createLimiter(max: number): Limiter {
  const limit = Math.max(1, Math.floor(max));
  let active = 0;
  const queue: Array<() => void> = [];

  const run = async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };

  return Object.assign(run, {
    active: () => active,
    pending: () => queue.length
  });
}
