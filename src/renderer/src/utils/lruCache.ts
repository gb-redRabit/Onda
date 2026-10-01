/**
 * Minimal bounded cache with least-recently-used eviction. Used by renderer
 * media caches (remote images, thumbnails) that must not grow without bound
 * across a long session. JavaScript `Map` preserves insertion order, so the
 * first key is the least recently used.
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
    // Touch: move to the most-recently-used end.
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
