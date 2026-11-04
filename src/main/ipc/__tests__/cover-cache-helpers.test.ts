import { describe, expect, it } from 'vitest';
import { evictCache } from '../cover/cover-cache-helpers';

function entry(bytes: number): { result: { data: string | null } } {
  return { result: { data: 'x'.repeat(bytes) } };
}

const sizeOf = (value: { result: { data: string | null } }): number =>
  value.result.data?.length ?? 0;

describe('evictCache', () => {
  it('evicts the oldest entries above the entry limit', () => {
    const map = new Map([
      ['a', entry(1)],
      ['b', entry(1)],
      ['c', entry(1)]
    ]);
    evictCache(map, 2);
    expect([...map.keys()]).toEqual(['b', 'c']);
  });

  it('evicts the oldest entries above the byte budget', () => {
    const map = new Map([
      ['a', entry(10)],
      ['b', entry(10)],
      ['c', entry(10)]
    ]);
    evictCache(map, 10, 25, sizeOf);
    expect([...map.keys()]).toEqual(['b', 'c']);
  });

  it('keeps every entry when both limits are satisfied', () => {
    const map = new Map([
      ['a', entry(10)],
      ['b', entry(10)]
    ]);
    evictCache(map, 10, 25, sizeOf);
    expect([...map.keys()]).toEqual(['a', 'b']);
  });
});
