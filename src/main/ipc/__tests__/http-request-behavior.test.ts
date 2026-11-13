import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Transport-level behaviour of httpRequest: redirects, header hygiene, limits,
// encoding and cancellation. `http`/`https` and DNS resolution are stubbed.

const h = vi.hoisted(() => ({
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
  resolve: vi.fn(),
  privateAllowed: vi.fn(),
  pinnedLookup: vi.fn(),
  requests: [] as Array<{
    req: FakeRequest;
    url: URL;
    options: Record<string, unknown>;
  }>
}));

vi.mock('http', () => ({ default: { request: h.httpRequest } }));
vi.mock('https', () => ({ default: { request: h.httpsRequest } }));
vi.mock('../network-target', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../network-target')>();
  return {
    ...actual,
    resolveNetworkTarget: h.resolve,
    privateNetworkAllowedForTarget: h.privateAllowed,
    createPinnedLookup: h.pinnedLookup
  };
});

import { httpRequest } from '../http-request';

class FakeRequest extends EventEmitter {
  setTimeout = vi.fn();
  write = vi.fn();
  end = vi.fn();
  destroy = vi.fn();
}

class FakeResponse extends EventEmitter {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  manual = false;
  resume = vi.fn();

  constructor(status = 200, headers: Record<string, string> = {}) {
    super();
    this.statusCode = status;
    this.statusMessage = `status-${status}`;
    this.headers = headers;
  }
}

function install(responses: FakeResponse[]): typeof h.httpRequest {
  const factory = vi.fn(
    (url: URL, options: Record<string, unknown>, cb: (r: FakeResponse) => void) => {
      const req = new FakeRequest();
      h.requests.push({ req, url, options });
      const res = responses.shift();
      if (res) {
        queueMicrotask(() => {
          cb(res);
          if (res.statusCode >= 200 && res.statusCode < 300 && !res.manual) {
            const chunks = (res as FakeResponse & { chunks?: Buffer[] }).chunks ?? [];
            for (const chunk of chunks) res.emit('data', chunk);
            res.emit('end');
          }
        });
      }
      return req;
    }
  );
  h.httpRequest.mockImplementation(factory);
  h.httpsRequest.mockImplementation(factory);
  return factory;
}

function withBody(res: FakeResponse, ...chunks: Buffer[]): FakeResponse {
  (res as FakeResponse & { chunks?: Buffer[] }).chunks = chunks;
  return res;
}

beforeEach(() => {
  h.requests.length = 0;
  h.httpRequest.mockReset();
  h.httpsRequest.mockReset();
  h.resolve.mockReset().mockImplementation(async (url: string) => ({
    url: new URL(url),
    addresses: [{ address: '93.184.216.34', family: 4 }]
  }));
  h.privateAllowed.mockReset().mockReturnValue(false);
  h.pinnedLookup.mockReset().mockReturnValue(() => {});
});

describe('httpRequest success path', () => {
  it('returns status, headers and body for a GET', async () => {
    install([
      withBody(
        new FakeResponse(200, { 'content-type': 'text/plain' }) as FakeResponse,
        Buffer.from('hello')
      )
    ]);

    const result = await httpRequest('https://example.com/page');

    expect(result).toEqual({
      status: 200,
      statusText: 'status-200',
      headers: { 'content-type': 'text/plain' },
      text: 'hello'
    });
    expect(h.httpsRequest).toHaveBeenCalled();
    expect(h.httpRequest).not.toHaveBeenCalled();
    const call = h.requests[0]!;
    expect(call.options).toMatchObject({ method: 'GET', lookup: expect.any(Function) });
    expect(call.req.setTimeout).toHaveBeenCalledWith(20_000, expect.any(Function));
    expect(call.req.end).toHaveBeenCalled();
    expect(call.req.write).not.toHaveBeenCalled();
    expect(h.pinnedLookup).toHaveBeenCalledWith([{ address: '93.184.216.34', family: 4 }]);
  });

  it('uses plain http for http URLs and sends the body', async () => {
    install([withBody(new FakeResponse())]);

    await httpRequest('http://example.com/api', { method: 'POST', body: '{"a":1}' });

    expect(h.httpRequest).toHaveBeenCalled();
    expect(h.httpsRequest).not.toHaveBeenCalled();
    expect(h.requests[0]!.req.write).toHaveBeenCalledWith('{"a":1}');
    expect(h.requests[0]!.options).toMatchObject({ method: 'POST' });
  });

  it('merges object defaults with caller headers', async () => {
    install([withBody(new FakeResponse())]);

    await httpRequest('https://example.com/', {
      headers: { 'X-Caller': '1', 'X-Override': 'caller' },
      defaultHeaders: { 'X-Default': '1', 'X-Override': 'default' }
    });

    expect(h.requests[0]!.options.headers).toEqual({
      'X-Default': '1',
      'X-Override': 'caller',
      'X-Caller': '1'
    });
  });

  it('evaluates function defaults per hop', async () => {
    const defaults = vi.fn((url: string) => ({ Referer: url }));
    install([withBody(new FakeResponse())]);

    await httpRequest('https://example.com/a', { defaultHeaders: defaults });

    expect(defaults).toHaveBeenCalledWith('https://example.com/a');
    expect(h.requests[0]!.options.headers).toEqual({ Referer: 'https://example.com/a' });
  });

  it('decodes the body with the requested encoding', async () => {
    install([withBody(new FakeResponse(), Buffer.from([0x41, 0xe9]))]);

    const result = await httpRequest('https://example.com/latin', { encoding: 'latin1' });

    expect(result.text).toBe('Aé');
  });
});

describe('httpRequest redirects', () => {
  it('follows same-origin redirects and keeps caller headers', async () => {
    const create = install([
      new FakeResponse(302, { location: '/next' }),
      withBody(new FakeResponse())
    ]);

    const result = await httpRequest('https://example.com/start', {
      headers: { Authorization: 'token' }
    });

    expect(result.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
    expect(h.requests[1]!.url.toString()).toBe('https://example.com/next');
    expect(h.requests[1]!.options.headers).toEqual({ Authorization: 'token' });
    expect(h.resolve).toHaveBeenCalledWith('https://example.com/start', {
      allowPrivateNetwork: false
    });
  });

  it('drops caller headers on cross-origin redirects and keeps protocol defaults', async () => {
    install([
      new FakeResponse(301, { location: 'https://cdn.example/file' }),
      withBody(new FakeResponse())
    ]);

    await httpRequest('https://example.com/start', {
      headers: { Authorization: 'token' },
      defaultHeaders: (url) => ({ Referer: url })
    });

    expect(h.requests[1]!.options.headers).toEqual({ Referer: 'https://cdn.example/file' });
  });

  it('refuses too many redirects', async () => {
    install([new FakeResponse(302, { location: '/1' }), new FakeResponse(302, { location: '/2' })]);

    await expect(httpRequest('https://example.com/start', { maxRedirects: 1 })).rejects.toThrow(
      'Too many redirects'
    );
  });

  it('honours the onRedirect guard', async () => {
    install([new FakeResponse(302, { location: 'https://evil.example/' })]);

    await expect(
      httpRequest('https://example.com/start', { onRedirect: () => false })
    ).rejects.toThrow('Redirect not allowed');
  });

  it('refuses cross-origin redirects for non-GET requests', async () => {
    install([new FakeResponse(307, { location: 'https://cdn.example/' })]);

    await expect(
      httpRequest('https://example.com/start', { method: 'POST', body: 'x' })
    ).rejects.toThrow('Cross-origin redirect refused');
  });
});

describe('httpRequest failures and limits', () => {
  it('rejects non-2xx responses', async () => {
    const res = new FakeResponse(404);
    install([res]);

    await expect(httpRequest('https://example.com/missing')).rejects.toThrow('HTTP 404');
    expect(res.resume).toHaveBeenCalled();
  });

  it('kills the request when the response is too large', async () => {
    install([withBody(new FakeResponse(), Buffer.alloc(8))]);

    const promise = httpRequest('https://example.com/big', { maxBytes: 4 });

    await expect(promise).rejects.toThrow('Response too large');
  });

  it('times out and destroys the request', async () => {
    install([]);
    const promise = httpRequest('https://example.com/slow');
    await Promise.resolve();

    const req = h.requests[0]!.req;
    const timeoutHandler = req.setTimeout.mock.calls[0]![1] as () => void;
    timeoutHandler();

    await expect(promise).rejects.toThrow('Timeout');
    expect(req.destroy).toHaveBeenCalled();
  });

  it('propagates response stream errors', async () => {
    const res = new FakeResponse();
    res.manual = true;
    install([res]);
    const promise = httpRequest('https://example.com/broken');
    await new Promise((r) => setTimeout(r, 0));
    res.emit('error', new Error('stream boom'));

    await expect(promise).rejects.toThrow('stream boom');
  });

  it('propagates request errors', async () => {
    install([]);
    const promise = httpRequest('https://example.com/refused');
    await Promise.resolve();
    h.requests[0]!.req.emit('error', new Error('ECONNREFUSED'));

    await expect(promise).rejects.toThrow('ECONNREFUSED');
  });

  it('propagates DNS/SSRF validation failures', async () => {
    h.resolve.mockRejectedValueOnce(new Error('Private network address is not allowed'));

    await expect(httpRequest('http://169.254.169.254/meta')).rejects.toThrow(
      'Private network address is not allowed'
    );
    expect(h.httpRequest).not.toHaveBeenCalled();
  });

  it('treats a missing status code as zero', async () => {
    const res = new FakeResponse();
    res.statusCode = undefined as never;
    install([res]);

    await expect(httpRequest('https://example.com/nostatus')).rejects.toThrow('HTTP 0');
  });

  it('defaults an empty status message and refuses a redirect without a location', async () => {
    const ok = new FakeResponse();
    ok.statusMessage = '';
    install([withBody(ok)]);
    await expect(httpRequest('https://example.com/ok')).resolves.toMatchObject({
      statusText: ''
    });

    install([new FakeResponse(302)]);
    await expect(httpRequest('https://example.com/redirect')).rejects.toThrow('HTTP 302');
  });

  it('binds private-network trust to the trusted origin', async () => {
    install([withBody(new FakeResponse())]);

    await httpRequest('https://api.example/x', {
      allowPrivateNetwork: true,
      trustedOrigin: 'https://trusted.example'
    });

    expect(h.privateAllowed).toHaveBeenCalledWith(
      'https://api.example/x',
      'https://trusted.example',
      true
    );
    expect(h.resolve).toHaveBeenCalledWith('https://api.example/x', {
      allowPrivateNetwork: false
    });
  });
});
