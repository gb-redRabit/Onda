import { describe, expect, it } from 'vitest';
import { applyPassKeys, dotGet } from '../sourceUrl';
import type { SourcePassKey } from '@renderer/types/sources';

describe('dotGet', () => {
  it('reads flat and nested paths', () => {
    expect(dotGet({ a: 1 }, 'a')).toBe(1);
    expect(dotGet({ a: { b: [{ c: 'x' }] } }, 'a.b.0.c')).toBe('x');
    expect(dotGet({ a: 1 }, 'a.b')).toBeUndefined();
    expect(dotGet(null, 'a')).toBeUndefined();
  });
});

describe('applyPassKeys', () => {
  const ROW = {
    anime_id: 'oshi-no-ko',
    anime_episode_number: 3,
    info: { name: 'Pilot' }
  };

  it('creates {as} keys from {from} fields (episode number → n)', () => {
    const keys: SourcePassKey[] = [{ from: 'anime_episode_number', as: 'n', type: 'number' }];
    const ctx = applyPassKeys({ ...ROW }, keys);
    expect(ctx).toMatchObject({ anime_episode_number: 3, n: 3 });
  });

  it('maps nested dot-path fields', () => {
    const keys: SourcePassKey[] = [{ from: 'info.name', as: 'title', type: 'string' }];
    const ctx = applyPassKeys({ ...ROW }, keys);
    expect(ctx).toMatchObject({ title: 'Pilot' });
  });

  it('skips keys whose field is missing (no null/undefined values)', () => {
    const keys: SourcePassKey[] = [{ from: 'missing.field', as: 'x', type: 'string' }];
    const ctx = applyPassKeys({ ...ROW }, keys);
    expect(ctx).not.toHaveProperty('x');
  });

  it('applies page keys first, then table keys (table wins)', () => {
    const pageKeys: SourcePassKey[] = [{ from: 'anime_id', as: 'slug', type: 'string' }];
    const tableKeys: SourcePassKey[] = [{ from: 'anime_episode_number', as: 'n', type: 'number' }];
    const ctx = applyPassKeys(applyPassKeys({ ...ROW }, pageKeys), tableKeys);
    expect(ctx).toMatchObject({ slug: 'oshi-no-ko', n: 3 });
  });

  it('returns the same object when no keys are configured', () => {
    const ctx = applyPassKeys({ a: 1 });
    expect(ctx).toEqual({ a: 1 });
  });
});