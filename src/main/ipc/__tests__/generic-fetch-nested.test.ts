import { describe, expect, it } from 'vitest';
import { dotGet, buildUrl, mapResponse, generateRangeItems } from '../generic-fetch';
import type { MediaSource, SourceEndpoint } from '../../../renderer/src/types/sources';

const SOURCE: MediaSource = {
  id: 's1',
  name: 'docchi',
  baseUrl: 'https://api.docchi.pl/v1',
  auth: { type: 'none' },
  endpoints: [],
  createdAt: 0
};

function endpoint(partial: Partial<SourceEndpoint>): SourceEndpoint {
  return {
    id: 'e1',
    name: 'ep',
    method: 'GET',
    path: '/',
    mapping: { fields: {} },
    ...partial
  };
}

describe('dotGet', () => {
  it('reads nested dot paths', () => {
    expect(dotGet({ a: { b: [{ c: 1 }] } }, 'a.b.0.c')).toBe(1);
    expect(dotGet({ a: 1 }, 'a')).toBe(1);
    expect(dotGet({ a: 1 }, 'a.b')).toBeUndefined();
    expect(dotGet(null, 'a')).toBeUndefined();
  });
});

describe('buildUrl — placeholders ({field} / {n})', () => {
  it('resolves {slug} from context into the child path', () => {
    const url = buildUrl(
      SOURCE,
      endpoint({ path: '/series/find/{slug}' }),
      undefined,
      undefined,
      undefined,
      { slug: 'boku-no-hero', name: 'Boku no Hero' }
    );
    expect(url).toBe('https://api.docchi.pl/v1/series/find/boku-no-hero');
  });

  it('resolves nested dot-path placeholders', () => {
    const url = buildUrl(
      SOURCE,
      endpoint({ path: '/series/find/{a.b.c}' }),
      undefined,
      undefined,
      undefined,
      { a: { b: { c: 'deep-value' } } }
    );
    expect(url).toBe('https://api.docchi.pl/v1/series/find/deep-value');
  });

  it('resolves {slug} and {n} together (episode path)', () => {
    const url = buildUrl(SOURCE, endpoint({ path: '/episodes/find/{slug}/{n}' }), undefined, undefined, undefined, {
      slug: 'dragon',
      n: 7
    });
    expect(url).toBe('https://api.docchi.pl/v1/episodes/find/dragon/7');
  });

  it('keeps unresolved placeholders raw when context is missing', () => {
    const url = buildUrl(SOURCE, endpoint({ path: '/series/find/{slug}' }));
    expect(url).toBe('https://api.docchi.pl/v1/series/find/{slug}');
  });

  it('keeps unresolved placeholders raw when the field is absent', () => {
    const url = buildUrl(SOURCE, endpoint({ path: '/series/find/{slug}' }), undefined, undefined, undefined, {
      name: 'no slug here'
    });
    expect(url).toBe('https://api.docchi.pl/v1/series/find/{slug}');
  });

  it('encodes path placeholder values', () => {
    const url = buildUrl(SOURCE, endpoint({ path: '/series/find/{slug}' }), undefined, undefined, undefined, {
      slug: 'a b/c'
    });
    expect(url).toBe('https://api.docchi.pl/v1/series/find/a%20b%2Fc');
  });

  it('resolves placeholders in query params', () => {
    const url = buildUrl(
      SOURCE,
      endpoint({ path: '/list', params: { series: '{slug}' } }),
      undefined,
      undefined,
      undefined,
      { slug: 'dragon' }
    );
    expect(url).toBe('https://api.docchi.pl/v1/list?series=dragon');
  });
});

describe('mapResponse — single-object wrapping', () => {
  it('maps an array at the root', () => {
    const items = mapResponse([{ id: 1, title: 'A' }], endpoint({ mapping: { fields: { id: 'id', title: 'title' } } }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: '1', title: 'A' });
  });

  it('maps an array at arrayPath', () => {
    const items = mapResponse(
      { data: [{ id: 2, title: 'B' }] },
      endpoint({ mapping: { arrayPath: 'data', fields: { id: 'id', title: 'title' } } })
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: '2', title: 'B' });
  });

  it('wraps a single-object response into one item', () => {
    const items = mapResponse(
      { id: 1, title: 'Solo' },
      endpoint({ mapping: { fields: { id: 'id', title: 'title' } } })
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: '1', title: 'Solo' });
  });

  it('maps playerUrl from the configured field (embed/player links)', () => {
    const items = mapResponse(
      { data: [{ id: 1, title: 'A', player: 'https://mega.nz/embed/abc' }] },
      endpoint({
        mapping: { arrayPath: 'data', fields: { id: 'id', title: 'title', playerUrl: 'player' } }
      })
    );
    expect(items[0]).toMatchObject({ playerUrl: 'https://mega.nz/embed/abc', mediaUrl: undefined });
  });

  it('keeps the whole object as extra (context for children)', () => {
    const items = mapResponse(
      { id: 1, slug: 'solo-series', episodes: 12 },
      endpoint({ mapping: { fields: { id: 'id', title: 'slug' } } })
    );
    expect(items[0]?.extra).toMatchObject({ id: 1, slug: 'solo-series', episodes: 12 });
  });

  it('returns [] for an empty array', () => {
    expect(mapResponse([], endpoint({ mapping: { fields: {} } }))).toEqual([]);
  });

  it('returns [] when arrayPath points to a non-array', () => {
    expect(mapResponse({ data: { id: 1 } }, endpoint({ mapping: { arrayPath: 'data', fields: {} } }))).toEqual([]);
  });
});

describe('generateRangeItems — episodes 1..N from parent context', () => {
  const ep = (partial: Partial<SourceEndpoint>) =>
    endpoint({ path: '/episodes/find/{slug}/{n}', mapping: { fields: {} }, ...partial });

  it('generates 1..N from the countField of the parent item', () => {
    const items = generateRangeItems(
      ep({ range: { countField: 'episodes', startAt: 1, titleTemplate: 'Odcinek {n}' } }),
      { slug: 'dragon', episodes: 3 }
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ id: '1', title: 'Odcinek 1', extra: { slug: 'dragon', n: 1 } });
    expect(items[2]).toMatchObject({ id: '3', title: 'Odcinek 3', extra: { n: 3, episodes: 3 } });
  });

  it('respects startAt and countValue (no fetch needed)', () => {
    const items = generateRangeItems(
      ep({ range: { countValue: 2, startAt: 5, titleTemplate: 'EP {n}' } }),
      { slug: 's' }
    );
    expect(items.map((i) => i.id)).toEqual(['5', '6']);
    expect(items.map((i) => i.title)).toEqual(['EP 5', 'EP 6']);
  });

  it('defaults title template to {n}', () => {
    const items = generateRangeItems(ep({ range: { countValue: 2, startAt: 1 } }), { slug: 'x' });
    expect(items.map((i) => i.title)).toEqual(['1', '2']);
  });

  it('caps generation at 1000 items', () => {
    const items = generateRangeItems(ep({ range: { countField: 'episodes', startAt: 1 } }), {
      slug: 'x',
      episodes: 5000
    });
    expect(items).toHaveLength(1000);
  });

  it('returns [] for range mode without context', () => {
    expect(generateRangeItems(ep({ range: { countField: 'episodes', startAt: 1 } }), undefined)).toEqual([]);
  });

  it('returns [] when the count field is missing', () => {
    expect(generateRangeItems(ep({ range: { countField: 'episodes', startAt: 1 } }), { slug: 'x' })).toEqual([]);
  });
});