import { describe, expect, it } from 'vitest';

import {
  buildEndpointFromDraft,
  collectFieldPaths,
  emptyEndpoint,
  endpointFromSource,
  randomId,
  toPassKeys
} from '../endpointDraft';

describe('randomId', () => {
  it('produces distinct ids', () => {
    expect(randomId()).not.toBe(randomId());
    expect(randomId().length).toBeGreaterThan(4);
  });
});

describe('emptyEndpoint', () => {
  it('returns a complete default draft', () => {
    const draft = emptyEndpoint();

    expect(draft).toMatchObject({
      name: '',
      method: 'GET',
      type: 'list',
      view: 'cards',
      path: '/',
      pageStart: null,
      tableEnabled: false,
      tableView: 'table',
      tableMode: 'endpoint',
      passKeys: [],
      tablePassKeys: []
    });
    expect(draft.id).toBeTruthy();
  });
});

describe('endpointFromSource', () => {
  it('maps a persisted endpoint to a draft', () => {
    const draft = endpointFromSource({
      id: 'e1',
      name: 'Endpoint',
      method: 'POST',
      type: 'page',
      view: 'gallery',
      path: '/list',
      params: { q: 'all', page: '1' },
      pagination: { pageParam: 'page', pageStart: 2, nextFromField: 'next', totalField: 'total' },
      childId: 'c1',
      range: { countField: 'count', countValue: 5, startAt: 1, titleTemplate: 'Ep {n}' },
      mapping: {
        arrayPath: 'data.items',
        fields: {
          id: 'id',
          title: 'title',
          subtitle: 'sub',
          thumbnail: 'thumb',
          mediaUrl: 'media',
          playerUrl: 'player',
          type: 'type',
          duration: 'duration',
          sourceUrl: 'source'
        }
      },
      passKeys: [{ from: 'a', as: 'b', type: 'number' }],
      table: {
        mode: 'field',
        view: 'compact',
        arrayField: 'rows',
        rowKey: 'key',
        title: 't',
        thumbnail: 'th',
        playerUrl: 'p',
        passKeys: [{ from: 'x', as: 'y', type: 'string' }],
        childId: 'child'
      }
    } as never);

    expect(draft).toMatchObject({
      id: 'e1',
      method: 'POST',
      type: 'page',
      view: 'gallery',
      paramsText: 'q=all\npage=1',
      pageParam: 'page',
      pageStart: 2,
      nextFromField: 'next',
      totalField: 'total',
      childId: 'c1',
      rangeCountField: 'count',
      rangeCountValue: 5,
      rangeStartAt: 1,
      rangeTitleTemplate: 'Ep {n}',
      arrayPath: 'data.items',
      fId: 'id',
      fTitle: 'title',
      fSubtitle: 'sub',
      fThumbnail: 'thumb',
      fMediaUrl: 'media',
      fPlayerUrl: 'player',
      fType: 'type',
      fDuration: 'duration',
      fSourceUrl: 'source',
      passKeys: [{ from: 'a', as: 'b', type: 'number' }],
      tableEnabled: true,
      tableView: 'compact',
      tableMode: 'field',
      tableArrayField: 'rows',
      tableRowKey: 'key',
      tableTitle: 't',
      tableThumbnail: 'th',
      tablePlayerUrl: 'p',
      tablePassKeys: [{ from: 'x', as: 'y', type: 'string' }],
      tableChildId: 'child'
    });
  });

  it('fills defaults for a minimal endpoint', () => {
    const draft = endpointFromSource({
      id: 'e2',
      name: 'Min',
      method: 'GET',
      path: '/',
      mapping: { fields: {} }
    } as never);

    expect(draft).toMatchObject({
      type: 'list',
      view: 'cards',
      paramsText: '',
      pageStart: null,
      tableEnabled: false,
      tableView: 'table',
      tableMode: 'endpoint',
      tableArrayField: '',
      tablePath: '',
      tableChildId: ''
    });
  });
});

describe('toPassKeys', () => {
  it('trims, filters invalid rows and normalises types', () => {
    expect(
      toPassKeys([
        { from: ' a ', as: ' b ', type: 'string' },
        { from: '', as: 'x', type: 'string' },
        { from: 'x', as: '', type: 'string' },
        { from: 'n', as: 'm', type: 'number' }
      ])
    ).toEqual([
      { from: 'a', as: 'b', type: 'string' },
      { from: 'n', as: 'm', type: 'number' }
    ]);
  });

  it('returns undefined without valid rows', () => {
    expect(toPassKeys([])).toBeUndefined();
  });
});

describe('buildEndpointFromDraft', () => {
  it('rejects a blank path', () => {
    expect(buildEndpointFromDraft({ ...emptyEndpoint(), path: '  ' })).toBeNull();
  });

  it('builds a minimal endpoint', () => {
    const result = buildEndpointFromDraft({ ...emptyEndpoint(), path: ' /items ' })!;

    expect(result).toMatchObject({
      name: 'Endpoint',
      method: 'GET',
      path: '/items',
      type: undefined,
      view: undefined,
      params: undefined,
      pagination: undefined,
      childId: undefined,
      range: undefined,
      passKeys: undefined,
      table: undefined
    });
    expect(result.mapping.fields.id).toBeUndefined();
  });

  it('builds all optional fields', () => {
    const result = buildEndpointFromDraft({
      ...emptyEndpoint(),
      id: 'e1',
      name: ' Named ',
      path: '/list',
      type: 'page',
      view: 'gallery',
      paramsText: 'q=x\nbad\n=empty',
      pageParam: ' page ',
      pageStart: 2.9,
      nextFromField: ' next ',
      totalField: ' total ',
      childId: 'ignored-for-page',
      rangeCountField: 'count',
      rangeCountValue: 5.9,
      rangeStartAt: 0,
      rangeTitleTemplate: ' Ep {n} ',
      arrayPath: ' data ',
      fId: ' id ',
      passKeys: [{ from: 'a', as: 'b', type: 'number' }],
      tableEnabled: true,
      tableView: 'compact',
      tableMode: 'field',
      tableArrayField: ' rows ',
      tablePath: 'ignored',
      tableRowKey: ' key ',
      tableTitle: ' title ',
      tableThumbnail: ' thumb ',
      tablePlayerUrl: ' player ',
      tablePassKeys: [{ from: 'x', as: 'y', type: 'string' }],
      tableChildId: 'child'
    })!;

    expect(result).toMatchObject({
      id: 'e1',
      name: 'Named',
      type: 'page',
      view: 'gallery',
      params: { q: 'x' },
      pagination: { pageParam: 'page', pageStart: 2, nextFromField: 'next', totalField: 'total' },
      childId: undefined,
      range: { countField: 'count', countValue: 5, startAt: 0, titleTemplate: 'Ep {n}' },
      passKeys: [{ from: 'a', as: 'b', type: 'number' }],
      table: {
        mode: 'field',
        view: 'compact',
        arrayField: 'rows',
        path: undefined,
        rowKey: 'key',
        title: 'title',
        thumbnail: 'thumb',
        playerUrl: 'player',
        passKeys: [{ from: 'x', as: 'y', type: 'string' }],
        childId: 'child'
      },
      mapping: { arrayPath: 'data', fields: expect.objectContaining({ id: 'id' }) }
    });
  });

  it('keeps a list child id and no table', () => {
    const list = buildEndpointFromDraft({
      ...emptyEndpoint(),
      path: '/list',
      type: 'list',
      childId: 'child',
      tableEnabled: true,
      tableMode: 'endpoint',
      tablePath: ' /rows ',
      tableView: 'table'
    })!;

    expect(list.childId).toBe('child');
    expect(list.table).toBeUndefined();

    const page = buildEndpointFromDraft({
      ...emptyEndpoint(),
      path: '/page',
      type: 'page',
      tableEnabled: true,
      tableMode: 'endpoint',
      tablePath: ' /rows ',
      tableView: 'table'
    })!;

    expect(page.table).toMatchObject({ mode: 'endpoint', path: '/rows', view: undefined });
  });

  it('drops invalid numeric pagination and range values', () => {
    const result = buildEndpointFromDraft({
      ...emptyEndpoint(),
      path: '/x',
      pageParam: 'page',
      pageStart: Number.NaN,
      rangeCountValue: Number.NaN,
      rangeStartAt: -1
    })!;

    expect(result.pagination).toEqual({
      pageParam: 'page',
      pageStart: undefined,
      nextFromField: undefined,
      totalField: undefined
    });
    expect(result.range).toEqual({
      countField: undefined,
      countValue: undefined,
      startAt: undefined,
      titleTemplate: undefined
    });

    const noRange = buildEndpointFromDraft({
      ...emptyEndpoint(),
      path: '/x',
      rangeCountValue: null,
      rangeStartAt: null
    })!;
    expect(noRange.range).toBeUndefined();
  });

  it('drops blank table fields', () => {
    const field = buildEndpointFromDraft({
      ...emptyEndpoint(),
      path: '/page',
      type: 'page',
      tableEnabled: true,
      tableMode: 'field',
      tableArrayField: '   ',
      tableRowKey: 'key'
    })!;

    expect(field.table).toMatchObject({ arrayField: undefined, path: undefined, rowKey: 'key' });

    const endpoint = buildEndpointFromDraft({
      ...emptyEndpoint(),
      path: '/page',
      type: 'page',
      tableEnabled: true,
      tableMode: 'endpoint',
      tablePath: '   ',
      tableRowKey: 'key'
    })!;

    expect(endpoint.table).toMatchObject({ arrayField: undefined, path: undefined, rowKey: 'key' });
  });

  it('drops a blank page parameter while keeping pagination', () => {
    const result = buildEndpointFromDraft({
      ...emptyEndpoint(),
      path: '/x',
      pageParam: '   '
    })!;

    expect(result.pagination).toEqual({
      pageParam: undefined,
      pageStart: undefined,
      nextFromField: undefined,
      totalField: undefined
    });
  });

  it('ignores params with a blank key', () => {
    const result = buildEndpointFromDraft({
      ...emptyEndpoint(),
      path: '/x',
      paramsText: '  =value\nok=1'
    })!;

    expect(result.params).toEqual({ ok: '1' });
  });

  it('uses a generated id when missing', () => {
    const result = buildEndpointFromDraft({ ...emptyEndpoint(), id: '', path: '/x' })!;

    expect(result.id).toBeTruthy();
  });
});

describe('collectFieldPaths', () => {
  it('collects nested dot paths with depth and array handling', () => {
    const paths = collectFieldPaths({
      data: { items: [{ id: 1, nested: { deep: { tooDeep: {} } } }] },
      other: 'x'
    });

    expect(paths).toContain('data');
    expect(paths).toContain('data.items');
    expect(paths).toContain('data.items.id');
    expect(paths).toContain('data.items.nested');
    expect(paths).toContain('other');
  });

  it('ignores primitives and empty arrays', () => {
    expect(collectFieldPaths(null)).toEqual([]);
    expect(collectFieldPaths('text')).toEqual([]);
    expect(collectFieldPaths([])).toEqual([]);
  });

  it('caps the number of paths', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 120; i++) wide[`k${i}`] = i;

    expect(collectFieldPaths(wide)).toHaveLength(80);
  });

  it('stops descending beyond the depth limit', () => {
    const paths = collectFieldPaths({ a: { b: { c: { d: { e: 1 } } } } });

    expect(paths).toContain('a.b.c.d');
    expect(paths).not.toContain('a.b.c.d.e');
  });
});
