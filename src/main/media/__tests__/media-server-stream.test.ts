import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Proxy strumieni: http(s), resolver sieciowy, rejestr providerów i guardy są
// podstawione; fake request/response pozwalają sprawdzić każdą gałąź.
const state = vi.hoisted(() => ({
  upstreams: [] as any[],
  get: vi.fn(),
  resolveTarget: vi.fn(),
  createLookup: vi.fn(() => () => undefined),
  isGeneric: vi.fn(() => false),
  getFactory: vi.fn(),
  detectLimit: vi.fn((): { limited: boolean; retryAfterSeconds?: number } => ({ limited: false })),
  formatLimit: vi.fn(() => 'limit reached'),
  validate: vi.fn((value: string): URL | null => new URL(value)),
  isAllowedRadioHost: vi.fn(() => false),
  sleep: vi.fn(async () => undefined),
  broadcast: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('http', () => ({ default: { get: (...args: any[]) => state.get(...args) } }));
vi.mock('https', () => ({ default: { get: (...args: any[]) => state.get(...args) } }));
vi.mock('../../../shared/logger', () => ({ logger: state.logger }));
vi.mock('../../ipc/network-target', () => ({
  resolveNetworkTarget: state.resolveTarget,
  createPinnedLookup: state.createLookup
}));
vi.mock('../media-server-stream-registry', () => ({
  isRegisteredGenericStreamUrl: state.isGeneric,
  getProviderStreamFactory: state.getFactory
}));
vi.mock('../../ipc/providers/provider-limits', () => ({
  detectProviderLimit: state.detectLimit,
  formatProviderLimit: state.formatLimit
}));
vi.mock('../media-server-guards', () => ({
  isAllowedRadioHost: state.isAllowedRadioHost,
  validateStreamUrl: state.validate,
  STREAM_MAX_REDIRECTS: 2,
  STREAM_MAX_ATTEMPTS: 3,
  STREAM_RETRY_DELAYS: [0, 0],
  STREAM_TIMEOUT_MS: 5000,
  STREAM_USER_AGENT: 'Onda-test',
  sleep: state.sleep
}));
vi.mock('../../utils/broadcast', () => ({ broadcastToAllWindows: state.broadcast }));

const { handleStreamProxy, handleProviderStreamProxy } = await import('../media-server-stream');

function makeResponse(): any {
  const res = new EventEmitter() as EventEmitter & Record<string, any>;
  res.writableEnded = false;
  res.destroyed = false;
  res.writeHead = vi.fn((status: number, headers?: unknown) => {
    res.status = status;
    res.headers = headers;
  });
  res.end = vi.fn(() => {
    res.writableEnded = true;
  });
  res.destroy = vi.fn(() => {
    res.destroyed = true;
  });
  return res;
}

function makeRequest(method = 'GET', range?: string) {
  return { method, headers: range ? { range } : {} } as any;
}

function upstream(
  init: {
    statusCode?: number;
    headers?: Record<string, string>;
    error?: Error;
    body?: string;
  } = {}
): any {
  if (init.error) return { error: init.error };
  const up = new EventEmitter() as EventEmitter & Record<string, any>;
  up.statusCode = init.statusCode ?? 200;
  up.headers = init.headers ?? {};
  up.destroy = vi.fn();
  up.pipe = vi.fn((target: { end?: () => void }) => target.end?.());
  up.body = init.body;
  return up;
}

function installGet(): void {
  state.get.mockImplementation((_url: unknown, _opts: unknown, callback: (up: any) => void) => {
    const req = new EventEmitter() as EventEmitter & Record<string, any>;
    req.destroy = vi.fn();
    req.setTimeout = vi.fn();
    const next = state.upstreams.shift();
    process.nextTick(() => {
      if (next?.error) req.emit('error', next.error);
      else {
        callback(next ?? upstream());
        if (next?.body) {
          queueMicrotask(() => {
            next.emit('data', Buffer.from(next.body));
            next.emit('end');
          });
        }
      }
    });
    return req;
  });
}

beforeEach(() => {
  state.upstreams = [];
  state.get.mockReset();
  installGet();
  state.resolveTarget.mockReset();
  state.resolveTarget.mockImplementation(async (raw: string) => ({
    url: new URL(raw),
    addresses: [{ address: '1.2.3.4', family: 4 }]
  }));
  state.createLookup.mockReset();
  state.createLookup.mockReturnValue(() => undefined);
  state.isGeneric.mockReset();
  state.isGeneric.mockReturnValue(false);
  state.getFactory.mockReset();
  state.getFactory.mockReturnValue(null);
  state.detectLimit.mockReset();
  state.detectLimit.mockReturnValue({ limited: false });
  state.formatLimit.mockReset();
  state.formatLimit.mockReturnValue('limit reached');
  state.validate.mockReset();
  state.validate.mockImplementation((value: string) => new URL(value));
  state.isAllowedRadioHost.mockReset();
  state.isAllowedRadioHost.mockReturnValue(false);
  state.sleep.mockClear();
  state.broadcast.mockClear();
  state.logger.info.mockClear();
  state.logger.warn.mockClear();
  state.logger.error.mockClear();
});

describe('handleStreamProxy validation', () => {
  it('rejects missing and invalid URLs', async () => {
    const missing = makeResponse();
    await handleStreamProxy(makeRequest(), missing, '');
    expect(missing.status).toBe(400);
    expect(missing.end).toHaveBeenCalledWith('missing url');

    const invalid = makeResponse();
    await handleStreamProxy(makeRequest(), invalid, 'not a url');
    expect(invalid.status).toBe(400);
    expect(invalid.end).toHaveBeenCalledWith('invalid url');
  });

  it('rejects a URL outside the allowlist', async () => {
    state.validate.mockReturnValue(null);
    const res = makeResponse();
    await handleStreamProxy(makeRequest(), res, 'https://evil.example/file');
    expect(res.status).toBe(403);
    expect(res.end).toHaveBeenCalledWith('forbidden');
  });

  it('rejects a generic target when resolution fails', async () => {
    state.isGeneric.mockReturnValue(true);
    state.resolveTarget.mockRejectedValue(new Error('blocked'));
    const res = makeResponse();
    await handleStreamProxy(makeRequest(), res, 'https://googlevideo.example/x');
    expect(res.status).toBe(403);
    expect(state.logger.warn).toHaveBeenCalled();
  });
});

describe('handleStreamProxy upstream', () => {
  it('proxies a successful 200 response with selected headers', async () => {
    state.isGeneric.mockReturnValue(true);
    state.upstreams = [
      upstream({
        statusCode: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': '100',
          'cache-control': 'no-store',
          'x-ignored': 'nope'
        }
      })
    ];
    const res = makeResponse();

    await handleStreamProxy(makeRequest('GET', 'bytes=0-'), res, 'https://cdn.example/a');

    expect(res.status).toBe(200);
    expect(res.headers).toEqual({
      'content-type': 'audio/mpeg',
      'content-length': '100',
      'cache-control': 'no-store'
    });
    expect(state.resolveTarget).toHaveBeenCalledWith('https://cdn.example/a', {
      allowPrivateNetwork: false,
      blockLoopback: false
    });
    expect(state.createLookup).toHaveBeenCalled();
  });

  it('destroys the upstream for HEAD requests', async () => {
    const up = upstream({ statusCode: 200, headers: { 'content-type': 'audio/mpeg' } });
    state.upstreams = [up];
    const res = makeResponse();

    await handleStreamProxy(makeRequest('HEAD'), res, 'https://cdn.example/a');

    expect(up.destroy).toHaveBeenCalled();
    expect(up.pipe).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  it('passes a terminal 416 with range headers', async () => {
    const up = upstream({
      statusCode: 416,
      headers: { 'content-range': 'bytes */100', 'accept-ranges': 'bytes' }
    });
    state.upstreams = [up];
    const res = makeResponse();

    await handleStreamProxy(makeRequest('GET', 'bytes=200-'), res, 'https://cdn.example/a');

    expect(res.status).toBe(416);
    expect(res.headers).toEqual({
      'content-range': 'bytes */100',
      'accept-ranges': 'bytes'
    });
    expect(up.destroy).toHaveBeenCalled();
  });

  it('retries transport errors and finally reports 502', async () => {
    state.upstreams = [
      upstream({ error: new Error('boom1') }),
      upstream({ error: new Error('boom2') }),
      upstream({ error: new Error('boom3') })
    ];
    const res = makeResponse();

    await handleStreamProxy(makeRequest(), res, 'https://cdn.example/a');

    expect(state.get).toHaveBeenCalledTimes(3);
    expect(state.sleep).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
    expect(res.end).toHaveBeenCalledWith('upstream error');
  });

  it('retries bad statuses and logs the body', async () => {
    state.upstreams = [
      upstream({ statusCode: 500, body: 'server exploded' }),
      upstream({ statusCode: 500, body: 'again' }),
      upstream({ statusCode: 500, body: 'last' })
    ];
    const res = makeResponse();

    await handleStreamProxy(makeRequest(), res, 'https://cdn.example/a');

    expect(state.get).toHaveBeenCalledTimes(3);
    expect(state.logger.warn).toHaveBeenCalledWith(
      'media-server',
      expect.stringContaining('server exploded')
    );
    expect(res.status).toBe(502);
  });

  it('follows redirects and preserves the validated protocol for generic URLs', async () => {
    state.isGeneric.mockReturnValue(true);
    state.upstreams = [
      upstream({ statusCode: 302, headers: { location: '/next' } }),
      upstream({ statusCode: 200, headers: { 'content-type': 'audio/mpeg' } })
    ];
    const res = makeResponse();

    await handleStreamProxy(makeRequest(), res, 'https://cdn.example/start');

    expect(state.get).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('blocks a generic redirect that downgrades to http', async () => {
    state.isGeneric.mockReturnValue(true);
    state.upstreams = [
      upstream({ statusCode: 302, headers: { location: 'http://cdn.example/plain' } })
    ];
    const res = makeResponse();

    await handleStreamProxy(makeRequest(), res, 'https://cdn.example/start');

    expect(res.status).toBe(403);
    expect(res.end).toHaveBeenCalledWith('forbidden');
  });

  it('reports a malformed redirect location', async () => {
    state.upstreams = [upstream({ statusCode: 302, headers: { location: 'http://[bad' } })];
    const res = makeResponse();

    await handleStreamProxy(makeRequest(), res, 'https://cdn.example/start');

    expect(res.status).toBe(502);
    expect(res.end).toHaveBeenCalledWith('bad redirect');
  });

  it('stops after too many redirects', async () => {
    state.upstreams = [
      upstream({ statusCode: 302, headers: { location: '/1' } }),
      upstream({ statusCode: 302, headers: { location: '/2' } }),
      upstream({ statusCode: 302, headers: { location: '/3' } })
    ];
    const res = makeResponse();

    await handleStreamProxy(makeRequest(), res, 'https://cdn.example/start');

    expect(res.status).toBe(502);
    expect(res.end).toHaveBeenCalledWith('too many redirects');
  });

  it('uses the user-station policy for private radio hosts', async () => {
    state.isAllowedRadioHost.mockReturnValue(true);
    state.upstreams = [upstream({ statusCode: 200 })];
    const res = makeResponse();

    await handleStreamProxy(makeRequest(), res, 'http://192.168.1.20:8000/radio');

    expect(state.resolveTarget).toHaveBeenCalledWith('http://192.168.1.20:8000/radio', {
      allowPrivateNetwork: true,
      blockLoopback: true
    });
  });

  it('returns when the client disconnects before the upstream response', async () => {
    const res = makeResponse();
    state.upstreams = [upstream({ statusCode: 200 })];
    const run = handleStreamProxy(makeRequest(), res, 'https://cdn.example/a');
    res.emit('close');
    await run;
    expect(state.get).toHaveBeenCalledTimes(1);
  });
});

describe('handleProviderStreamProxy', () => {
  function providerStream() {
    const stream = new EventEmitter() as EventEmitter & Record<string, any>;
    stream.destroy = vi.fn();
    stream.pipe = vi.fn();
    return stream;
  }

  it('validates the token and factory', async () => {
    const missing = makeResponse();
    await handleProviderStreamProxy(makeRequest(), missing, '');
    expect(missing.status).toBe(400);

    const unknown = makeResponse();
    await handleProviderStreamProxy(makeRequest(), unknown, 'nope');
    expect(unknown.status).toBe(404);
  });

  it('streams a provider resource with size and range', async () => {
    const stream = providerStream();
    state.getFactory.mockReturnValue(async () => ({
      stream,
      mime: 'video/mp4',
      size: 1000
    }));
    const res = makeResponse();

    await handleProviderStreamProxy(makeRequest('GET', 'bytes=100-199'), res, 'token');

    expect(res.status).toBe(206);
    expect(res.headers).toEqual({
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Range': 'bytes 100-199/1000',
      'Content-Length': '100'
    });
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });

  it('uses the full size when no range is requested and destroys for HEAD', async () => {
    const stream = providerStream();
    state.getFactory.mockReturnValue(async () => ({ stream, size: 42 }));
    const res = makeResponse();

    await handleProviderStreamProxy(makeRequest('HEAD'), res, 'token');

    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({
      'Content-Type': 'application/octet-stream',
      'Content-Length': '42'
    });
    expect(stream.destroy).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  it('defaults range end when size is unknown', async () => {
    const stream = providerStream();
    state.getFactory.mockReturnValue(async () => ({ stream }));
    const res = makeResponse();

    await handleProviderStreamProxy(makeRequest('GET', 'bytes=10-'), res, 'token');

    expect(res.status).toBe(206);
    expect(res.headers['Content-Range']).toBeUndefined();
    expect(res.headers['Content-Length']).toBe('1');
  });

  it('maps provider limits to 429 and broadcasts', async () => {
    state.getFactory.mockReturnValue(async () => {
      throw new Error('quota exceeded');
    });
    state.detectLimit.mockReturnValue({ limited: true, retryAfterSeconds: 30 });
    const res = makeResponse();

    await handleProviderStreamProxy(makeRequest(), res, 'token');
    await vi.waitFor(() => expect(state.broadcast).toHaveBeenCalled());

    expect(res.status).toBe(429);
    expect(res.headers).toMatchObject({ 'Retry-After': '30' });
    expect(res.end).toHaveBeenCalledWith('provider limit: limit reached');
    expect(state.broadcast).toHaveBeenCalledWith('providers:limit', {
      message: 'limit reached',
      retryAfterSeconds: 30
    });
  });

  it('reports generic provider errors as 502', async () => {
    state.getFactory.mockReturnValue(async () => {
      throw new Error('broken');
    });
    const res = makeResponse();

    await handleProviderStreamProxy(makeRequest(), res, 'token');

    expect(res.status).toBe(502);
    expect(res.end).toHaveBeenCalledWith('provider stream error');
  });

  it('destroys an unused stream when the client disconnects', async () => {
    const stream = providerStream();
    state.getFactory.mockReturnValue(async () => ({ stream, size: 10 }));
    const res = makeResponse();
    const run = handleProviderStreamProxy(makeRequest(), res, 'token');
    res.destroyed = true;
    await run;
    expect(stream.destroy).toHaveBeenCalled();
  });

  it('forwards only unexpected stream errors', async () => {
    const stream = providerStream();
    state.getFactory.mockReturnValue(async () => ({ stream }));
    const res = makeResponse();

    await handleProviderStreamProxy(makeRequest(), res, 'token');
    stream.emit('error', new Error('EPIPE'));
    expect(state.logger.warn).not.toHaveBeenCalled();

    stream.emit('error', new Error('decode failed'));
    expect(state.logger.warn).toHaveBeenCalledWith(
      'media-server',
      'provider stream body error',
      expect.any(Error)
    );
    expect(res.destroy).toHaveBeenCalled();
  });
});
