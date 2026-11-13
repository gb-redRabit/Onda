import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeJsonAtomic: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  uuid: vi.fn(() => 'uuid-1')
}));

vi.mock('fs/promises', () => ({ readFile: h.readFile }));
vi.mock('crypto', () => ({ randomUUID: h.uuid }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: h.warn, info: h.info, error: vi.fn() }
}));
vi.mock('../../../utils/write-queue', () => ({
  createWriteLock:
    () =>
    <T>(fn: () => Promise<T>) =>
      fn(),
  writeJsonAtomic: h.writeJsonAtomic
}));

import {
  applySourceTrust,
  deleteSource,
  loadSources,
  reorderSources,
  sanitizeEndpoint,
  sanitizeImportedSource,
  sanitizeSource,
  saveAllSources,
  saveSource
} from '../sources-store';

const endpoint = (over: Record<string, unknown> = {}) => ({
  name: 'Items',
  path: '/api/items',
  ...over
});

const source = (over: Record<string, unknown> = {}) => ({
  name: 'Source',
  baseUrl: 'https://example.com',
  endpoints: [endpoint()],
  ...over
});

function persisted(list: unknown) {
  h.readFile.mockResolvedValue(JSON.stringify(list));
}

beforeEach(() => {
  h.readFile.mockReset().mockRejectedValue(new Error('ENOENT'));
  h.writeJsonAtomic.mockReset().mockResolvedValue(undefined);
  h.warn.mockClear();
  h.info.mockClear();
  h.uuid.mockClear();
});

describe('sanitizeEndpoint', () => {
  it('rejects non-objects and payloads without a path', () => {
    expect(sanitizeEndpoint(null, 0)).toBeNull();
    expect(sanitizeEndpoint('x', 0)).toBeNull();
    expect(sanitizeEndpoint({ name: 'No path' }, 0)).toBeNull();
    expect(sanitizeEndpoint({ path: '   ' }, 0)).toBeNull();
  });

  it('fills defaults and generates ids', () => {
    const result = sanitizeEndpoint({ path: '/api' }, 2);

    expect(result).toEqual({
      id: 'uuid-1',
      name: 'Endpoint 3',
      method: 'GET',
      path: '/api',
      type: undefined,
      view: undefined,
      params: undefined,
      pagination: undefined,
      childId: undefined,
      range: undefined,
      passKeys: undefined,
      table: undefined,
      mapping: {
        arrayPath: undefined,
        fields: {
          id: undefined,
          title: undefined,
          subtitle: undefined,
          thumbnail: undefined,
          mediaUrl: undefined,
          playerUrl: undefined,
          type: undefined,
          duration: undefined,
          sourceUrl: undefined
        }
      }
    });
  });

  it('keeps a supplied id, page type and known view', () => {
    const result = sanitizeEndpoint({ id: 'ep-1', path: '/api', type: 'page', view: 'gallery' }, 0);

    expect(result).toMatchObject({ id: 'ep-1', type: 'page', view: 'gallery' });
  });

  it('drops unknown views and uses POST only when requested', () => {
    const result = sanitizeEndpoint({ path: '/api', view: 'grid', method: 'POST' }, 0);

    expect(result).toMatchObject({ view: undefined, method: 'POST' });
  });

  it('sanitizes params with a limit and key length cap', () => {
    const params: Record<string, unknown> = { ok: 'yes', nope: 1 };
    for (let i = 0; i < 60; i += 1) params[`k${i}`] = 'v';

    const result = sanitizeEndpoint({ path: '/api', params }, 0);

    expect(Object.keys(result!.params!)).toHaveLength(50);
    expect(result!.params).toMatchObject({ ok: 'yes' });
    expect(result!.params).not.toHaveProperty('nope');
  });

  it('omits params when nothing survives', () => {
    expect(sanitizeEndpoint({ path: '/api', params: [] }, 0)!.params).toBeUndefined();
    expect(sanitizeEndpoint({ path: '/api', params: { a: 1 } }, 0)!.params).toBeUndefined();
  });

  it('builds pagination from valid fields and drops empty objects', () => {
    const full = sanitizeEndpoint(
      {
        path: '/api',
        pagination: {
          pageParam: 'page',
          pageStart: 2.8,
          nextFromField: 'next',
          totalField: 'total'
        }
      },
      0
    );
    expect(full!.pagination).toEqual({
      pageParam: 'page',
      pageStart: 2,
      nextFromField: 'next',
      totalField: 'total'
    });

    expect(sanitizeEndpoint({ path: '/api', pagination: {} }, 0)!.pagination).toBeUndefined();
    expect(sanitizeEndpoint({ path: '/api', pagination: [] }, 0)!.pagination).toBeUndefined();
    expect(
      sanitizeEndpoint({ path: '/api', pagination: { pageStart: 0, pageParam: 7 } }, 0)!.pagination
    ).toEqual({
      pageParam: undefined,
      pageStart: 1,
      nextFromField: undefined,
      totalField: undefined
    });
    expect(
      sanitizeEndpoint({ path: '/api', pagination: { pageStart: Number.NaN } }, 0)!.pagination
    ).toBeUndefined();
  });

  it('clamps the range and requires a usable selector', () => {
    const full = sanitizeEndpoint(
      {
        path: '/api',
        range: {
          countField: 'count',
          countValue: 99999,
          startAt: -5,
          titleTemplate: 'Item {n}'
        }
      },
      0
    );
    expect(full!.range).toEqual({
      countField: 'count',
      countValue: 10000,
      startAt: 0,
      titleTemplate: 'Item {n}'
    });

    expect(sanitizeEndpoint({ path: '/api', range: { countField: 'x' } }, 0)!.range).toMatchObject({
      countField: 'x',
      countValue: undefined
    });
    expect(sanitizeEndpoint({ path: '/api', range: { countValue: 3 } }, 0)!.range).toMatchObject({
      countField: undefined,
      countValue: 3
    });
    expect(sanitizeEndpoint({ path: '/api', range: {} }, 0)!.range).toBeUndefined();
    expect(sanitizeEndpoint({ path: '/api', range: [] }, 0)!.range).toBeUndefined();
  });

  it('sanitizes pass keys', () => {
    const result = sanitizeEndpoint(
      {
        path: '/api',
        passKeys: [
          null,
          { from: 'a' },
          { from: 'a', as: 'b' },
          { from: 'c', as: 'd', type: 'number' },
          { from: 'c', as: 'd', type: 'string' }
        ]
      },
      0
    );

    expect(result!.passKeys).toEqual([
      { from: 'a', as: 'b', type: 'string' },
      { from: 'c', as: 'd', type: 'number' },
      { from: 'c', as: 'd', type: 'string' }
    ]);
    expect(sanitizeEndpoint({ path: '/api', passKeys: 'x' }, 0)!.passKeys).toBeUndefined();
    expect(sanitizeEndpoint({ path: '/api', passKeys: [] }, 0)!.passKeys).toBeUndefined();
  });

  it('builds field tables and drops empty ones', () => {
    const result = sanitizeEndpoint(
      {
        path: '/api',
        table: {
          mode: 'field',
          view: 'compact',
          arrayField: 'items',
          path: '/ignored',
          rowKey: 'id',
          title: 'name',
          thumbnail: 'thumb',
          playerUrl: 'url',
          childId: 'child-1',
          passKeys: [{ from: 'a', as: 'b' }]
        }
      },
      0
    );

    expect(result!.table).toEqual({
      mode: 'field',
      view: 'compact',
      arrayField: 'items',
      path: undefined,
      rowKey: 'id',
      title: 'name',
      thumbnail: 'thumb',
      playerUrl: 'url',
      passKeys: [{ from: 'a', as: 'b', type: 'string' }],
      childId: 'child-1'
    });

    expect(sanitizeEndpoint({ path: '/api', table: {} }, 0)!.table).toBeUndefined();
    expect(sanitizeEndpoint({ path: '/api', table: [] }, 0)!.table).toBeUndefined();
    expect(
      sanitizeEndpoint({ path: '/api', table: { path: '/rows', view: 'grid' } }, 0)!.table
    ).toMatchObject({ mode: 'endpoint', path: '/rows', view: undefined });
  });

  it('sanitizes mapping fields and arrayPath', () => {
    const result = sanitizeEndpoint(
      {
        path: '/api',
        mapping: { arrayPath: 'data.items', fields: { id: 'id', title: 'title', extra: 'x' } }
      },
      0
    );

    expect(result!.mapping).toEqual({
      arrayPath: 'data.items',
      fields: expect.objectContaining({ id: 'id', title: 'title' })
    });
    expect(result!.mapping.fields).not.toHaveProperty('extra');
  });

  it('ignores malformed mapping shapes', () => {
    expect(sanitizeEndpoint({ path: '/api', mapping: [] }, 0)!.mapping.arrayPath).toBeUndefined();
    expect(
      sanitizeEndpoint({ path: '/api', mapping: { fields: [] } }, 0)!.mapping.fields.id
    ).toBeUndefined();
    expect(
      sanitizeEndpoint({ path: '/api', mapping: { arrayPath: 5, fields: { id: 9 } } }, 0)!.mapping
    ).toMatchObject({ arrayPath: undefined, fields: { id: undefined } });
  });

  it('clamps child ids to one hundred characters', () => {
    const result = sanitizeEndpoint({ path: '/api', childId: 'x'.repeat(150) }, 0);

    expect(result!.childId).toHaveLength(100);
    expect(sanitizeEndpoint({ path: '/api', childId: '' }, 0)!.childId).toBeUndefined();
  });
});

describe('sanitizeSource', () => {
  it('rejects invalid shapes', () => {
    expect(sanitizeSource(null)).toBeNull();
    expect(sanitizeSource([])).toBeNull();
    expect(sanitizeSource({ baseUrl: 'https://a' })).toBeNull();
    expect(sanitizeSource({ name: 'A' })).toBeNull();
    expect(sanitizeSource(source({ baseUrl: 'ftp://a' }))).toBeNull();
    expect(sanitizeSource(source({ baseUrl: `https://a/${'x'.repeat(1000)}` }))).toBeNull();
    expect(sanitizeSource(source({ endpoints: [] }))).toBeNull();
    expect(sanitizeSource(source({ endpoints: 'x' }))).toBeNull();
    expect(sanitizeSource(source({ endpoints: [{ name: 'no path' }] }))).toBeNull();
  });

  it('builds a minimal source with trusted defaults', () => {
    const result = sanitizeSource(source())!;

    expect(result).toMatchObject({
      id: 'uuid-1',
      name: 'Source',
      baseUrl: 'https://example.com',
      allowPrivateNetwork: false,
      auth: { type: 'none' }
    });
    expect(result.createdAt).toEqual(expect.any(Number));
    expect(result.endpoints).toHaveLength(1);
  });

  it('keeps provided id, private network flag and timestamp', () => {
    const result = sanitizeSource(
      source({ id: 'src-1', allowPrivateNetwork: true, createdAt: 123 })
    )!;

    expect(result).toMatchObject({ id: 'src-1', allowPrivateNetwork: true, createdAt: 123 });
  });

  it('ignores a truthy non-boolean private network flag', () => {
    expect(sanitizeSource(source({ allowPrivateNetwork: 'yes' }))!.allowPrivateNetwork).toBe(false);
  });

  it('sanitizes auth variants', () => {
    expect(sanitizeSource(source({ auth: 'x' }))!.auth).toEqual({ type: 'none' });
    expect(sanitizeSource(source({ auth: { type: 'basic' } }))!.auth).toEqual({ type: 'none' });
    expect(
      sanitizeSource(
        source({
          auth: {
            type: 'apikey',
            apiKeyId: 'k'.repeat(250),
            headerName: 'X-Key',
            queryParam: 'key',
            extra: 'ignored'
          }
        })
      )!.auth
    ).toEqual({
      type: 'apikey',
      apiKeyId: 'k'.repeat(200),
      headerName: 'X-Key',
      queryParam: 'key'
    });
    expect(sanitizeSource(source({ auth: { type: 'bearer', headerName: 4 } }))!.auth).toEqual({
      type: 'bearer'
    });
  });

  it('sanitizes download preferences', () => {
    expect(sanitizeSource(source({ download: 'x' }))!.download).toBeUndefined();
    expect(sanitizeSource(source({ download: {} }))!.download).toBeUndefined();
    expect(sanitizeSource(source({ download: { folder: true } }))!.download).toEqual({
      outputDir: undefined,
      folder: true
    });
    expect(
      sanitizeSource(source({ download: { outputDir: '  D:/out  ', folder: 'yes' } }))!.download
    ).toEqual({ outputDir: 'D:/out', folder: undefined });
    expect(
      sanitizeSource(source({ download: { outputDir: `/${'x'.repeat(1000)}` } }))!.download
    ).toBeUndefined();
  });

  it('drops dangling child ids on endpoints and tables', () => {
    const result = sanitizeSource(
      source({
        endpoints: [
          endpoint({ id: 'a', childId: 'missing' }),
          endpoint({ id: 'b', childId: 'a', table: { childId: 'nope', rowKey: 'id' } })
        ]
      })
    )!;

    expect(result.endpoints[0].childId).toBeUndefined();
    expect(result.endpoints[1].childId).toBe('a');
    expect(result.endpoints[1].table!.childId).toBeUndefined();
  });

  it('caps endpoints at twenty and drops invalid entries', () => {
    const endpoints = [] as { name: string; path?: string }[];
    for (let i = 0; i < 25; i += 1) endpoints.push(endpoint({ id: `e-${i}` }));
    endpoints.push({ name: 'bad' });

    const result = sanitizeSource(source({ endpoints }))!;

    expect(result.endpoints).toHaveLength(20);
    expect(result.endpoints[0].id).toBe('e-0');
  });
});

describe('import trust', () => {
  it('never grants private network access on import', () => {
    const result = sanitizeImportedSource(source({ allowPrivateNetwork: true }))!;

    expect(result.allowPrivateNetwork).toBe(false);
  });

  it('returns null for invalid imports', () => {
    expect(sanitizeImportedSource({})).toBeNull();
  });
});

describe('applySourceTrust', () => {
  it('strips trust from a draft without a stored record', () => {
    const draft = sanitizeSource(
      source({ allowPrivateNetwork: true, auth: { type: 'apikey', apiKeyId: 'k' } })
    )!;

    const result = applySourceTrust(draft, undefined);

    expect(result.allowPrivateNetwork).toBe(false);
    expect(result.auth).toEqual({ type: 'none' });
  });

  it('copies trust, base url, auth and endpoints from the stored record', () => {
    const stored = sanitizeSource(
      source({
        id: 'src-1',
        baseUrl: 'https://trusted.example',
        allowPrivateNetwork: true,
        auth: { type: 'bearer' }
      })
    )!;
    const draft = sanitizeSource(source({ baseUrl: 'https://attacker.example' }))!;

    const result = applySourceTrust(draft, stored);

    expect(result.allowPrivateNetwork).toBe(true);
    expect(result.baseUrl).toBe('https://trusted.example');
    expect(result.auth).toEqual({ type: 'bearer' });
    expect(result.endpoints).toBe(stored.endpoints);
  });
});

describe('readList', () => {
  it('returns an empty list when the file is missing or malformed', async () => {
    await expect(loadSources('file.json')).resolves.toEqual([]);

    h.readFile.mockResolvedValue('{oops');
    await expect(loadSources('file.json')).resolves.toEqual([]);
  });

  it('returns an empty list for non-array payloads', async () => {
    persisted({ sources: [] });

    await expect(loadSources('file.json')).resolves.toEqual([]);
  });

  it('filters invalid entries and caps the list', async () => {
    const items: unknown[] = [null, { name: 'bad' }];
    for (let i = 0; i < 60; i += 1) {
      items.push(source({ id: `s-${i}`, name: `Source ${i}` }));
    }
    persisted(items);

    const list = await loadSources('file.json');

    expect(list).toHaveLength(50);
    expect(list[0].id).toBe('s-0');
  });
});

describe('saveSource', () => {
  it('rejects an invalid payload and logs a warning', async () => {
    persisted([]);

    const result = await saveSource('file.json', { name: 'broken' });

    expect(result).toEqual({ list: [], saved: null, error: 'Invalid source' });
    expect(h.warn).toHaveBeenCalledWith('sources', 'saveSource: invalid source payload rejected');
    expect(h.writeJsonAtomic).not.toHaveBeenCalled();
  });

  it('appends a new source and persists the list', async () => {
    persisted([]);

    const result = await saveSource('file.json', source({ id: 'new' }));

    expect(result.saved).toMatchObject({ id: 'new' });
    expect(result.list).toHaveLength(1);
    expect(h.writeJsonAtomic).toHaveBeenCalledWith('file.json', result.list);
  });

  it('replaces an existing source in place', async () => {
    persisted([source({ id: 'a', name: 'Old' }), source({ id: 'b' })]);

    const result = await saveSource('file.json', source({ id: 'a', name: 'New' }));

    expect(result.list.map((s) => s.name)).toEqual(['New', 'Source']);
    expect(h.writeJsonAtomic).toHaveBeenCalledTimes(1);
  });

  it('refuses to exceed the source cap', async () => {
    const list = Array.from({ length: 50 }, (_, i) => source({ id: `s-${i}` }));
    persisted(list);

    const result = await saveSource('file.json', source({ id: 'overflow' }));

    expect(result).toEqual({ list: expect.any(Array), saved: null, error: 'Max sources reached' });
    expect(h.writeJsonAtomic).not.toHaveBeenCalled();
  });
});

describe('deleteSource', () => {
  it('removes a source and persists', async () => {
    persisted([source({ id: 'a' }), source({ id: 'b' })]);

    const result = await deleteSource('file.json', 'a');

    expect(result.map((s) => s.id)).toEqual(['b']);
    expect(h.writeJsonAtomic).toHaveBeenCalledWith('file.json', result);
  });

  it('skips the write for an unknown id', async () => {
    persisted([source({ id: 'a' })]);

    const result = await deleteSource('file.json', 'missing');

    expect(result).toHaveLength(1);
    expect(h.writeJsonAtomic).not.toHaveBeenCalled();
  });
});

describe('reorderSources', () => {
  it('orders by id and keeps unknown entries at the end', async () => {
    persisted([source({ id: 'a' }), source({ id: 'b' }), source({ id: 'c' })]);

    const result = await reorderSources('file.json', ['c', 'a']);

    expect(result.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(h.writeJsonAtomic).toHaveBeenCalledWith('file.json', result);
    expect(h.info).toHaveBeenCalledWith('sources', 'reordered 3 sources');
  });
});

describe('saveAllSources', () => {
  it('caps the imported list and persists it', async () => {
    const list = Array.from({ length: 55 }, (_, i) => source({ id: `s-${i}` }));

    const result = await saveAllSources('file.json', list as never);

    expect(result).toHaveLength(50);
    expect(h.writeJsonAtomic).toHaveBeenCalledWith('file.json', result);
  });
});
