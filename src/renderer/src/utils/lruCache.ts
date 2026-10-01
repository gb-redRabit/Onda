/**
 * Minimalny ograniczony cache z eviction least-recently-used. Używany przez cache
 * mediów renderera (zdalne obrazy, miniatury), które nie mogą rosnąć bez ograniczeń
 * przez długą sesję. JavaScript `Map` zachowuje kolejność wstawiania, więc
 * pierwszy klucz jest najdawniej używany.
 */
export class LruCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max <= 0) {
      throw new RangeError('LruCache max must be a positive integer');
    }
  }

  get size(): number {
    return this.map.size;
  }

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Dotknięcie: przenieś na koniec najświeżej używanych.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
