import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  httpRequest: vi.fn(),
  buildRequest: vi.fn(),
  rangeItems: vi.fn(),
  paginationMeta: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('../http-request', () => ({ httpRequest: state.httpRequest }));
vi.mock('../generic-fetch-headers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../generic-fetch-headers')>();
  return { ...actual, buildEndpointRequest: state.buildRequest };
});
vi.mock('../generic-fetch-mappers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../generic-fetch-mappers')>();
  return {
    ...actual,
    generateRangeItems: state.rangeItems,
    paginationMeta: state.paginationMeta
  };
});
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

import {
  fetchSourceItems,
  fetchTableRows,
  httpJsonFetch,
  mapResponse,
  testSourceConnection
} from '../generic-fetch';
import type { MediaSource, SourceEndpoint } from '../../../shared/types/sources';

function source(): MediaSource {
  return { name: 'Test', baseUrl: 'https://api.example.com' } as never;
}

function endpoint(overrides: Record<string, unknown> = {}): SourceEndpoint {
  return {
    id: 'list',
    path: '/list',
    type: 'list',
    mapping: {
      arrayPath: 'items',
      fields: {
        id: 'id',
        title: 'title',
        subtitle: 'sub',
        thumbnail: 'thumb',
        mediaUrl: 'media',
        playerUrl: 'player',
        duration: 'duration',
        sourceUrl: 'source',
        type: 'kind'
      }
    },
    ...overrides
  } as never;
}

beforeEach(() => {
  state.httpRequest.mockReset();
  state.httpRequest.mockResolvedValue({
    text: '{}',
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
  state.buildRequest.mockReset();
  state.buildRequest.mockResolvedValue({
    url: 'https://api.example.com/list',
    method: 'GET',
    headers: { Authorization: 'secret' },
    allowPrivateNetwork: true,
    trustedOrigin: 'https://api.example.com'
  });
  state.rangeItems.mockReset();
  state.rangeItems.mockReturnValue([{ id: '1', title: 'Episode 1', type: 'file' }]);
  state.paginationMeta.mockReset();
  state.paginationMeta.mockReturnValue({ hasMore: false });
  state.loggerWarn.mockReset();
});

describe('item mapping', () => {
  it('maps fields and detects the media type', () => {
    const items = mapResponse(
      {
        items: [
          {
            id: 7,
            title: 'A',
            sub: 'S',
            thumb: 'https://cdn/a.jpg',
            media: 'https://cdn/a.mp4',
            player: 'https://cdn/embed',
            duration: '12:00',
            source: 'https://page/a',
            kind: 'audio'
          }
        ]
      },
      endpoint()
    );

    expect(items[0]).toMatchObject({
      id: '7',
      title: 'A',
      subtitle: 'S',
      thumbnail: 'https://cdn/a.jpg',
      mediaUrl: 'https://cdn/a.mp4',
      playerUrl: 'https://cdn/embed',
      duration: '12:00',
      sourceUrl: 'https://page/a',
      type: 'audio'
    });
  });

  it('detects extension types when no type field is given', () => {
    const cfg = endpoint({
      mapping: {
        arrayPath: 'items',
        fields: { title: 'title', mediaUrl: 'media' }
      }
    });
    const items = mapResponse(
      {
        items: [
          { title: 'img', media: 'https://cdn/a.JPG' },
          { title: 'vid', media: 'https://cdn/a.m3u8' },
          { title: 'aud', media: 'https://cdn/a.flac' },
          { title: 'bin', media: 'https://cdn/a.zip' },
          { title: 'bad', media: 'not a url' },
          { title: 'none' }
        ]
      },
      cfg
    );

    expect(items.map((item) => item.type)).toEqual([
      'image',
      'video',
      'audio',
      'file',
      'file',
      'file'
    ]);
  });

  it('accepts a literal known type and ignores unknown literals', () => {
    const literal = endpoint({
      mapping: {
        arrayPath: 'items',
        fields: { title: 'title', type: 'image' }
      }
    });
    expect(mapResponse({ items: [{ title: 'x' }] }, literal)[0].type).toBe('image');

    const broken = endpoint({
      mapping: {
        arrayPath: 'items',
        fields: { title: 'title', type: 'nonsense' }
      }
    });
    expect(mapResponse({ items: [{ title: 'x' }] }, broken)[0].type).toBe('file');
  });

  it('drops entries without title, media or thumbnail', () => {
    expect(mapResponse({ items: [null, 'text', {}, { id: '1' }] }, endpoint())).toEqual([]);
  });

  it('wraps a single object and handles bad array paths', () => {
    const single = endpoint({
      mapping: { fields: { title: 'title' } }
    });
    expect(mapResponse({ title: 'only' }, single)).toHaveLength(1);
    expect(mapResponse(42, single)).toEqual([]);
    expect(mapResponse({ items: 'nope' }, endpoint())).toEqual([]);
  });
});

describe('slim payloads', () => {
  function sourceEndpoint(passKeys?: SourceEndpoint['passKeys']) {
    return endpoint({
      passKeys,
      mapping: { arrayPath: 'items', fields: { title: 'title' } }
    });
  }

  it('keeps only configured passKeys as passContext', async () => {
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify({ items: [{ title: 'A', slug: 'a', id: 5 }] }),
      status: 200,
      headers: {}
    });
    const ep = sourceEndpoint([
      { from: 'slug', as: 'slug', type: 'string' },
      { from: 'id', as: 'id', type: 'number' },
      { from: 'missing', as: 'missing', type: 'string' },
      { from: '', as: 'empty', type: 'string' },
      { from: 'slug' } as never
    ]);

    const res = await fetchSourceItems(source(), ep);

    expect(res.items[0]).not.toHaveProperty('extra');
    expect((res.items[0] as { passContext?: unknown }).passContext).toEqual({
      slug: 'a',
      id: 5
    });
  });

  it('omits passContext when nothing resolves', async () => {
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify({ items: [{ title: 'A', slug: 'a' }] }),
      status: 200,
      headers: {}
    });

    const res = await fetchSourceItems(
      source(),
      sourceEndpoint([{ from: 'nope', as: 'x', type: 'string' }])
    );

    expect(res.items[0]).not.toHaveProperty('passContext');
    expect(res.items[0]).not.toHaveProperty('extra');
  });
});

describe('httpJsonFetch', () => {
  it('parses JSON and masks headers', async () => {
    state.httpRequest.mockResolvedValueOnce({
      text: '{"ok":true}',
      status: 201,
      headers: { authorization: 'secret', 'content-type': 'application/json' }
    });

    const res = await httpJsonFetch('https://api.example.com/x', {
      method: 'GET',
      headers: {},
      trustedOrigin: 'https://api.example.com'
    });

    expect(res.json).toEqual({ ok: true });
    expect(res.status).toBe(201);
    expect(res.headers.authorization).not.toBe('secret');
    expect(state.httpRequest).toHaveBeenCalledWith(
      'https://api.example.com/x',
      expect.objectContaining({
        method: 'GET',
        defaultHeaders: { Accept: 'application/json', 'User-Agent': 'Onda/1.0' },
        maxRedirects: 5,
        trustedOrigin: 'https://api.example.com'
      })
    );
  });

  it('treats an empty body as an empty object', async () => {
    state.httpRequest.mockResolvedValueOnce({ text: '', status: 204, headers: {} });
    const res = await httpJsonFetch('https://x', { method: 'GET', headers: {} });
    expect(res.json).toEqual({});
  });

  it('rejects invalid JSON', async () => {
    state.httpRequest.mockResolvedValueOnce({ text: '<html>', status: 200, headers: {} });
    await expect(httpJsonFetch('https://x', { method: 'GET', headers: {} })).rejects.toThrow(
      'Invalid JSON response'
    );
  });

  it('lets the explicit trusted origin win and forwards redirects', async () => {
    await httpJsonFetch(
      'https://x',
      { method: 'POST', headers: {}, body: 'b', allowPrivateNetwork: true, trustedOrigin: 'a' },
      2,
      'b'
    );

    expect(state.httpRequest).toHaveBeenCalledWith(
      'https://x',
      expect.objectContaining({
        method: 'POST',
        body: 'b',
        allowPrivateNetwork: true,
        trustedOrigin: 'b',
        maxRedirects: 2
      })
    );
  });
});

describe('fetchTableRows', () => {
  const table = { mode: 'field', arrayField: 'rows', title: 'Row {n}', rowKey: 'n' };

  it('returns [] without a table', async () => {
    await expect(fetchTableRows(source(), endpoint())).resolves.toEqual([]);
  });

  it('returns [] for an endpoint table without a path', async () => {
    const ep = endpoint({ table: { mode: 'endpoint', path: '  ' } });
    await expect(fetchTableRows(source(), ep)).resolves.toEqual([]);
    expect(state.httpRequest).not.toHaveBeenCalled();
  });

  it('fetches field-mode rows from the page response', async () => {
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify({ rows: [{ n: 1 }, { n: 2 }] }),
      status: 200,
      headers: {}
    });

    const rows = await fetchTableRows(source(), endpoint({ table }));

    expect(rows.map((row) => row.title)).toEqual(['Row 1', 'Row 2']);
    expect(state.buildRequest).toHaveBeenCalledWith(
      source(),
      expect.objectContaining({ path: '/list' }),
      expect.objectContaining({ includeBody: false })
    );
  });

  it('fetches endpoint-mode rows with a GET request', async () => {
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify([{ n: 9 }]),
      status: 200,
      headers: {}
    });
    const ep = endpoint({ table: { mode: 'endpoint', path: '/rows', title: 'R{n}', rowKey: 'n' } });

    const rows = await fetchTableRows(source(), ep, { context: { slug: 'a' } });

    expect(rows).toHaveLength(1);
    expect(state.buildRequest).toHaveBeenCalledWith(
      source(),
      expect.objectContaining({ path: '/rows', method: 'GET', params: undefined }),
      expect.objectContaining({ includeBody: false })
    );
  });

  it('logs failures and returns []', async () => {
    state.httpRequest.mockRejectedValueOnce(new Error('offline'));

    await expect(fetchTableRows(source(), endpoint({ table }))).resolves.toEqual([]);

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'sources',
      expect.stringContaining('table fetch failed for Test')
    );
  });

  it('stringifies non-error failures', async () => {
    state.httpRequest.mockRejectedValueOnce('plain');

    await fetchTableRows(source(), endpoint({ table }));

    expect(state.loggerWarn).toHaveBeenCalledWith('sources', expect.stringContaining('plain'));
  });
});

describe('fetchSourceItems', () => {
  it('generates range items without a request', async () => {
    const ep = endpoint({ range: { countField: 'count' } });

    const res = await fetchSourceItems(source(), ep, { context: { count: 2 } });

    expect(res).toEqual({
      items: [{ id: '1', title: 'Episode 1', type: 'file' }],
      hasMore: false
    });
    expect(state.rangeItems).toHaveBeenCalledWith(ep, { count: 2 });
    expect(state.httpRequest).not.toHaveBeenCalled();
  });

  it('returns mapped items with pagination metadata', async () => {
    state.paginationMeta.mockReturnValue({ hasMore: true, nextFrom: 'next' });
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify({ items: [{ title: 'A', source: 'https://x/a.mp3' }] }),
      status: 200,
      headers: {}
    });

    const res = await fetchSourceItems(source(), endpoint(), {
      query: { q: 'x' },
      pageToken: 'tok',
      page: 2
    });

    expect(res).toEqual({
      items: [expect.objectContaining({ title: 'A', type: 'audio' })],
      hasMore: true,
      nextFrom: 'next'
    });
    expect(state.buildRequest).toHaveBeenCalledWith(
      source(),
      endpoint(),
      expect.objectContaining({ query: { q: 'x' }, pageToken: 'tok', page: 2 })
    );
  });

  it('marks page-mode lists with items as having more', async () => {
    state.paginationMeta.mockReturnValue({ hasMore: false });
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify({ items: [{ title: 'A' }] }),
      status: 200,
      headers: {}
    });

    const res = await fetchSourceItems(source(), endpoint({ pagination: { pageParam: 'page' } }));

    expect(res.hasMore).toBe(true);
  });

  it('attaches table rows for page endpoints with field tables', async () => {
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify({
        items: [{ title: 'A' }],
        rows: [{ n: 1 }]
      }),
      status: 200,
      headers: {}
    });
    const ep = endpoint({
      type: 'page',
      table: { mode: 'field', arrayField: 'rows', title: 'Row {n}', rowKey: 'n' }
    });

    const res = await fetchSourceItems(source(), ep);

    expect(res.tableRows?.map((row) => row.title)).toEqual(['Row 1']);
    expect(res.items).toHaveLength(1);
  });

  it('reports request failures', async () => {
    state.httpRequest.mockRejectedValueOnce(new Error('boom'));

    const res = await fetchSourceItems(source(), endpoint());

    expect(res).toEqual({ items: [], hasMore: false, error: 'boom' });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'sources',
      expect.stringContaining('fetch failed for Test/list')
    );
  });

  it('stringifies non-error failures', async () => {
    state.httpRequest.mockRejectedValueOnce('plain');

    const res = await fetchSourceItems(source(), endpoint());

    expect(res).toEqual({ items: [], hasMore: false, error: 'plain' });
  });
});

describe('testSourceConnection', () => {
  it('returns just status and masked headers by default', async () => {
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify({ items: [{ title: 'A' }] }),
      status: 200,
      headers: { authorization: 'secret' }
    });

    const res = await testSourceConnection(source(), endpoint());

    expect(res.success).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers?.authorization).not.toBe('secret');
    expect('sample' in res).toBe(false);
    expect('raw' in res).toBe(false);
  });

  it('includes the first sample and raw JSON on request', async () => {
    const json = { items: [{ title: 'A', source: 'https://x/a.mp3' }] };
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify(json),
      status: 200,
      headers: {}
    });

    const res = await testSourceConnection(source(), endpoint(), { includeRaw: true });

    expect(res.sample).toMatchObject({ title: 'A', type: 'audio' });
    expect(res.raw).toEqual(json);
  });

  it('falls back to the raw object as a sample', async () => {
    const json = { total: 2 };
    state.httpRequest.mockResolvedValueOnce({
      text: JSON.stringify(json),
      status: 200,
      headers: {}
    });
    const ep = endpoint({ mapping: { arrayPath: 'items', fields: { title: 'title' } } });

    const res = await testSourceConnection(source(), ep, { includeRaw: true });

    expect(res.sample).toMatchObject({
      id: '',
      title: '',
      type: 'file',
      extra: json
    });
  });

  it('reports failures', async () => {
    state.httpRequest.mockRejectedValueOnce(new Error('offline'));

    await expect(testSourceConnection(source(), endpoint())).resolves.toEqual({
      success: false,
      error: 'offline'
    });
  });

  it('stringifies non-error failures', async () => {
    state.httpRequest.mockRejectedValueOnce('plain');
    await expect(testSourceConnection(source(), endpoint())).resolves.toEqual({
      success: false,
      error: 'plain'
    });
  });
});
