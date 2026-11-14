// Wspólny, ograniczony cache peaks dla wszystkich instancji WaveformLayer.
// Wcześniej każdy component trzymał własną Map bez limitu — przełączanie
// utworów/instancji zostawiało kolejne tablice w pamięci.

const MAX_ENTRIES = 24;
const cache = new Map<string, number[] | null>();

export function hasCachedPeaks(path: string): boolean {
  return cache.has(path);
}

export function getCachedPeaks(path: string): number[] | null {
  const value = cache.get(path);
  if (value === undefined) return null;
  // LRU: odśwież kolejność przy trafieniu.
  cache.delete(path);
  cache.set(path, value);
  return value;
}

export function setCachedPeaks(path: string, value: number[] | null): void {
  cache.delete(path);
  cache.set(path, value);
  if (cache.size <= MAX_ENTRIES) return;
  cache.delete(cache.keys().next().value as string);
}
