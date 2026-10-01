import { describe, it, expect } from 'vitest';
import { LruCache } from '../lruCache';

describe('LruCache', () => {
  it('evicts the least recently used entry once max is exceeded', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // touch 'a' -> 'b' becomes the LRU

    cache.set('c', 3);

    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('re-setting an existing key refreshes it without growing', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);

    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(10);
    expect(cache.size).toBe(2);
  });

  it('rejects a non-positive max', () => {
    expect(() => new LruCache(0)).toThrow(RangeError);
    expect(() => new LruCache(-1)).toThrow(RangeError);
  });

  it('clear empties the cache', () => {
    const cache = new LruCache<number>(4);
    cache.set('a', 1);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
