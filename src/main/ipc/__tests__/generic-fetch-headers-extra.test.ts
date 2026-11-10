import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getStore: vi.fn(),
  store: { get: vi.fn() },
  decrypt: vi.fn(),
  buildUrl: vi.fn(),
  template: vi.fn((value: string) => value),
  loggerWarn: vi.fn(),
  url: '',
  apiKeys: null as unknown
}));

vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../cover/cover-cache', () => ({ getStore: h.getStore }));
vi.mock('../settings/settings-crypto', () => ({ decryptApiKeys: h.decrypt }));
vi.mock('../generic-fetch-mappers', () => ({
  buildUrl: h.buildUrl,
  resolveTemplate: h.template
}));

import {
  buildEndpointRequest,
  finalizeRequest,
  maskHeaders,
  resolveSourceHeaders
} from '../generic-fetch-headers';

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Source',
    baseUrl: 'https://api.example',
    auth: undefined,
    allowPrivateNetwork: false,
    ...overrides
  } as never;
}

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    method: 'GET',
    path: '/list',
    ...overrides
  } as never;
}

beforeEach(() => {
  h.apiKeys = {
    keys: [
      { id: 'k1', key: 'secret', isActive: true },
      { id: 'k2', key: 'off', isActive: false }
    ]
  };
  h.store.get.mockReset();
  h.store.get.mockReturnValue(h.apiKeys);
  h.getStore.mockReset();
  h.getStore.mockResolvedValue(h.store);
  h.decrypt.mockReset();
  h.decrypt.mockImplementation(() => h.apiKeys);
  h.buildUrl.mockReset();
  h.url = 'https://api.example/list';
  h.buildUrl.mockImplementation(() => h.url);
  h.template.mockReset();
  h.template.mockImplementation((value: string) => `t:${value}`);
  h.loggerWarn.mockReset();
});

describe('maskHeaders', () => {
  it('joins arrays and masks sensitive names case-insensitively', () => {
    expect(
      maskHeaders({
        'X-Trace': ['a', 'b'],
        'X-Auth-Token': 'tok',
        'proxy-authorization': 'p',
        Cookie: 'c'
      })
    ).toEqual({
      'X-Trace': 'a, b',
      'X-Auth-Token': '***',
      'proxy-authorization': '***',
      Cookie: '***'
    });
  });
});

describe('resolveSourceHeaders', () => {
  it('returns nothing without an API key id', async () => {
    await expect(resolveSourceHeaders()).resolves.toEqual({});
    expect(h.getStore).not.toHaveBeenCalled();
  });

  it('uses the active key and the default header', async () => {
    await expect(resolveSourceHeaders('k1')).resolves.toEqual({ 'X-API-Key': 'secret' });
  });

  it('uses a trimmed custom header name', async () => {
    await expect(resolveSourceHeaders('k1', '  Authorization  ')).resolves.toEqual({
      Authorization: 'secret'
    });

    await expect(resolveSourceHeaders('k1', '   ')).resolves.toEqual({
      'X-API-Key': 'secret'
    });
  });

  it('ignores inactive or missing keys', async () => {
    await expect(resolveSourceHeaders('k2')).resolves.toEqual({});
    await expect(resolveSourceHeaders('missing')).resolves.toEqual({});

    h.decrypt.mockReturnValueOnce(null);
    await expect(resolveSourceHeaders('k1')).resolves.toEqual({});
    h.decrypt.mockReturnValueOnce({ keys: undefined });
    await expect(resolveSourceHeaders('k1')).resolves.toEqual({});
  });

  it('logs store failures', async () => {
    h.getStore.mockRejectedValueOnce(new Error('store'));
    await expect(resolveSourceHeaders('k1')).resolves.toEqual({});
    expect(h.loggerWarn).toHaveBeenCalledWith('sources', 'resolveApiKey failed', expect.any(Error));
  });
});

describe('authentication types', () => {
  it('adds bearer, header, query and default auth', async () => {
    await expect(
      buildEndpointRequest(source({ auth: { type: 'none' } }), endpoint())
    ).resolves.toMatchObject({ headers: {} });

    await expect(
      buildEndpointRequest(source({ auth: { type: 'bearer', apiKeyId: 'k1' } }), endpoint())
    ).resolves.toMatchObject({ headers: { Authorization: 'Bearer secret' } });

    await expect(
      buildEndpointRequest(
        source({ auth: { type: 'header', apiKeyId: 'k1', headerName: 'X-Token' } }),
        endpoint()
      )
    ).resolves.toMatchObject({ headers: { 'X-Token': 'secret' } });

    await expect(
      buildEndpointRequest(source({ auth: { type: 'header', apiKeyId: 'k1' } }), endpoint())
    ).resolves.toMatchObject({ headers: { 'X-API-Key': 'secret' } });
  });

  it('puts query auth into the URL only', async () => {
    h.buildUrl.mockImplementation(
      (_s: unknown, _e: unknown, _t: unknown, query: Record<string, string>) =>
        `https://api.example/list?key=${query.key}`
    );

    const result = await buildEndpointRequest(
      source({ auth: { type: 'query', apiKeyId: 'k1', queryParam: 'key' } }),
      endpoint()
    );

    expect(result.url).toBe('https://api.example/list?key=secret');
    expect(result.headers).toEqual({});
  });

  it('skips auth without a valid key', async () => {
    await expect(
      buildEndpointRequest(source({ auth: { type: 'bearer', apiKeyId: 'k2' } }), endpoint())
    ).resolves.toMatchObject({ headers: {} });
  });
});

describe('same-origin protection', () => {
  it('keeps credentials for the same origin', () => {
    h.url = 'https://api.example/list?key=secret';
    const result = finalizeRequest(
      source(),
      endpoint(),
      { headers: { Authorization: 'Bearer secret' }, query: { key: 'secret' } },
      undefined,
      {},
      undefined,
      undefined
    );

    expect(result).toEqual({
      url: h.url,
      headers: { Authorization: 'Bearer secret' }
    });
    expect(h.loggerWarn).not.toHaveBeenCalled();
  });

  it('drops credentials that would cross origins', () => {
    h.url = 'https://cdn.other/list?key=secret';

    const result = finalizeRequest(
      source(),
      endpoint(),
      { headers: { Authorization: 'Bearer secret' }, query: { key: 'secret' } },
      undefined,
      { extra: '1' },
      undefined,
      undefined
    );

    expect(result.url).toBe('https://cdn.other/list?key=secret');
    expect(result.headers).toEqual({});
    expect(h.buildUrl).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      { extra: '1' },
      undefined,
      undefined
    );
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'sources',
      'credentials dropped: https://cdn.other is not same-origin as https://api.example'
    );
  });

  it('marks invalid target URLs', () => {
    h.buildUrl.mockReturnValue('not a url');

    finalizeRequest(
      source(),
      endpoint(),
      { headers: { Authorization: 'x' }, query: {} },
      undefined,
      {},
      undefined,
      undefined
    );

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'sources',
      'credentials dropped: (invalid) is not same-origin as https://api.example'
    );
  });

  it('does not log when there were no credentials', () => {
    h.url = 'https://cdn.other/list';

    const result = finalizeRequest(
      source(),
      endpoint(),
      { headers: {}, query: {} },
      undefined,
      {},
      undefined,
      undefined
    );

    expect(result.headers).toEqual({});
    expect(h.loggerWarn).not.toHaveBeenCalled();
  });
});

describe('buildEndpointRequest', () => {
  it('passes options through and returns trusted metadata', async () => {
    const result = await buildEndpointRequest(source({ allowPrivateNetwork: true }), endpoint(), {
      query: { q: '1' },
      pageToken: 'tok',
      page: 2,
      context: { a: 1 }
    });

    expect(h.buildUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'tok',
      { q: '1' },
      2,
      { a: 1 }
    );
    expect(result).toMatchObject({
      url: 'https://api.example/list',
      method: 'GET',
      body: undefined,
      allowPrivateNetwork: true,
      trustedOrigin: 'https://api.example'
    });
  });

  it('builds a POST body from templates and query', async () => {
    const result = await buildEndpointRequest(
      source(),
      endpoint({ method: 'POST', params: { first: 'a', second: 'b' } }),
      { query: { q: '1' }, context: { id: 3 } }
    );

    expect(h.template).toHaveBeenCalledWith('a', { id: 3 });
    expect(result.method).toBe('POST');
    expect(JSON.parse(result.body!)).toEqual({
      first: 't:a',
      second: 't:b',
      q: '1'
    });
  });

  it('omits the body when requested', async () => {
    const result = await buildEndpointRequest(
      source(),
      endpoint({ method: 'POST', params: { first: 'a' } }),
      { includeBody: false }
    );

    expect(result.body).toBeUndefined();
  });

  it('handles endpoints without params', async () => {
    const result = await buildEndpointRequest(source(), endpoint({ method: 'POST' }), {});

    expect(result.body).toBe('{}');
  });
});
