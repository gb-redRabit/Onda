import { describe, expect, it, vi } from 'vitest';
import type { MediaSource, SourceEndpoint } from '../../../shared/types/sources';

const buildSourceUrl = vi.hoisted(() => vi.fn(() => 'built-url'));

vi.mock('../../../shared/source-url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/source-url')>();
  return { ...actual, buildSourceUrl };
});

import {
  asString,
  buildUrl,
  dotGet,
  generateRangeItems,
  paginationMeta,
  resolveTemplate
} from '../generic-fetch-mappers';

// Szablony źródeł: generowanie zakresów, metadane paginacji i delegacja URL.

function endpoint(over: Partial<SourceEndpoint> = {}): SourceEndpoint {
  return { id: 'e', path: '/items', ...over } as SourceEndpoint;
}

describe('generateRangeItems', () => {
  it('returns nothing without a range or an object context', () => {
    expect(generateRangeItems(endpoint(), {})).toEqual([]);
    expect(generateRangeItems(endpoint({ range: { countValue: 2 } }), null)).toEqual([]);
    expect(generateRangeItems(endpoint({ range: { countValue: 2 } }), 'ctx')).toEqual([]);
  });

  it('generates items from countValue with the default title', () => {
    const items = generateRangeItems(endpoint({ range: { countValue: 2.9 } }), { show: 'x' });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: '1', title: '1', type: 'file' });
    expect(items[1]).toMatchObject({ id: '2', title: '2' });
    expect(items[0]!.extra).toMatchObject({ show: 'x', n: 1 });
  });

  it('respects startAt and a custom title template', () => {
    const items = generateRangeItems(
      endpoint({ range: { countValue: 2, startAt: 10, titleTemplate: ' Odcinek {n} ' } }),
      {}
    );

    expect(items.map((item) => item.title)).toEqual(['Odcinek 10', 'Odcinek 11']);
    expect(items.map((item) => item.id)).toEqual(['10', '11']);
  });

  it('prefers a numeric countField over countValue', () => {
    const items = generateRangeItems(
      endpoint({ range: { countValue: 99, countField: 'meta.total' } }),
      { meta: { total: 3.7 } }
    );

    expect(items).toHaveLength(3);
  });

  it('ignores non-numeric or non-finite countField values', () => {
    expect(
      generateRangeItems(endpoint({ range: { countValue: 1, countField: 'count' } }), {
        count: '4'
      })
    ).toHaveLength(1);
    expect(
      generateRangeItems(endpoint({ range: { countValue: 1, countField: 'count' } }), {
        count: Number.POSITIVE_INFINITY
      })
    ).toHaveLength(1);
  });

  it('clamps the count to the supported range', () => {
    expect(generateRangeItems(endpoint({ range: { countValue: -5 } }), {})).toEqual([]);
    expect(generateRangeItems(endpoint({ range: { countValue: 5000 } }), {})).toHaveLength(1000);
  });

  it('falls back to the index title when the template is blank', () => {
    const items = generateRangeItems(
      endpoint({ range: { countValue: 1, titleTemplate: '   ' } }),
      {}
    );

    expect(items[0]!.title).toBe('1');
  });

  it('supports a countField without a countValue', () => {
    const items = generateRangeItems(endpoint({ range: { countField: 'total' } }), { total: 2 });

    expect(items).toHaveLength(2);
  });
});

describe('paginationMeta', () => {
  it('reports no more pages without pagination config', () => {
    expect(paginationMeta({}, endpoint())).toEqual({ hasMore: false, nextFrom: undefined });
  });

  it('reads boolean-ish total fields', () => {
    for (const value of [true, 1, 'true', '1']) {
      expect(
        paginationMeta({ more: value }, endpoint({ pagination: { totalField: 'more' } }))
      ).toEqual({ hasMore: true, nextFrom: undefined });
    }
    expect(
      paginationMeta({ more: 'no' }, endpoint({ pagination: { totalField: 'more' } }))
    ).toEqual({ hasMore: false, nextFrom: undefined });
  });

  it('uses a present next token and marks more pages', () => {
    expect(
      paginationMeta(
        { meta: { next: 123 } },
        endpoint({ pagination: { nextFromField: 'meta.next' } })
      )
    ).toEqual({ hasMore: true, nextFrom: '123' });
  });

  it('ignores an empty next token', () => {
    expect(
      paginationMeta({ next: '' }, endpoint({ pagination: { nextFromField: 'next' } }))
    ).toEqual({ hasMore: false, nextFrom: undefined });
  });
});

describe('buildUrl', () => {
  it('delegates to the shared URL builder', () => {
    const source = { id: 's', name: 'S', baseUrl: 'https://api' } as MediaSource;
    const ep = endpoint();
    const query = { q: 'x' };

    expect(buildUrl(source, ep, 'token', query, 3, { id: 1 })).toBe('built-url');
    expect(buildSourceUrl).toHaveBeenCalledWith(source, ep, {
      pageToken: 'token',
      query,
      page: 3,
      context: { id: 1 }
    });
  });

  it('re-exports the shared dot-path helpers', () => {
    expect(dotGet({ a: [{ b: 1 }] }, 'a.0.b')).toBe(1);
    expect(asString(2)).toBe('2');
    expect(resolveTemplate('{a}', { a: 5 })).toBe('5');
  });
});
