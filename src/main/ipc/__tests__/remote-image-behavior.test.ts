import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const state = vi.hoisted(() => ({
  handler: null as any,
  httpsRequest: vi.fn(),
  nextResponse: null as any,
  nextRequestError: null as Error | null,
  resolveNetworkTarget: vi.fn(),
  createPinnedLookup: vi.fn(() => 'pinned-lookup'),
  isLoopbackHost: vi.fn((host: string) => host === 'localhost' || host === '127.0.0.1'),
  isNeverPublicAddress: vi.fn(
    (host: string) => host.startsWith('10.') || host.startsWith('169.254.') || host === '::1'
  ),
  loggerWarn: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (_channel: string, handler: any) => {
      state.handler = handler;
    }
  }
}));
vi.mock('node:https', () => ({ default: { request: state.httpsRequest } }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../network-target', () => ({
  resolveNetworkTarget: state.resolveNetworkTarget,
  createPinnedLookup: state.createPinnedLookup,
  isLoopbackHost: state.isLoopbackHost,
  isNeverPublicAddress: state.isNeverPublicAddress
}));

import {
  clearRemoteImageCache,
  fetchRemoteImageBytes,
  followImageRedirects,
  getRemoteImage,
  readRemoteImageBody,
  registerRemoteImageHandler,
  type RemoteImageResponse
} from '../remote-image';

function bodyFromChunks(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    }
  };
}

function response(
  status: number,
  headers: Record<string, string | undefined> = {},
  chunks: Uint8Array[] = []
): RemoteImageResponse & { cancel: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  const body = bodyFromChunks(chunks);
  const res = {
    status,
    statusCode: status,
    headers,
    body,
    cancel: vi.fn(),
    destroy: vi.fn(),
    [Symbol.asyncIterator]: () => body[Symbol.asyncIterator]()
  };
  res.cancel = vi.fn(() => res.destroy());
  return res;
}

function image(body = 'x', type = 'image/png', extra: Record<string, string> = {}) {
  return response(200, { 'content-type': type, ...extra }, [Buffer.from(body)]);
}

function requestTo(handler: (url: string) => RemoteImageResponse | Promise<RemoteImageResponse>) {
  const calls: string[] = [];
  const request = async (url: string) => {
    calls.push(url);
    return handler(url);
  };
  return { calls, request };
}

const URL_A = 'https://cdn.example.com/a.png';

beforeEach(() => {
  clearRemoteImageCache();
  state.handler = null;
  state.nextResponse = image();
  state.nextRequestError = null;
  state.resolveNetworkTarget.mockReset();
  state.resolveNetworkTarget.mockImplementation(async (url: string) => ({
    url: new URL(url),
    addresses: [{ address: '93.184.216.34', family: 4 }]
  }));
  state.createPinnedLookup.mockClear();
  state.isLoopbackHost.mockClear();
  state.isNeverPublicAddress.mockClear();
  state.loggerWarn.mockReset();
  state.httpsRequest.mockReset();
  state.httpsRequest.mockImplementation((_url: URL, _options: any, callback: any) => {
    const req = new EventEmitter() as any;
    req.end = vi.fn(() => {
      if (state.nextRequestError) {
        req.emit('error', state.nextRequestError);
        return;
      }
      callback(state.nextResponse);
    });
    return req;
  });
});

afterEach(() => {
  vi.useRealTimers();
  clearRemoteImageCache();
});

describe('URL policy', () => {
  it('rejects malformed, non-https, credentialed and loopback URLs', async () => {
    const { calls, request } = requestTo(() => image());

    expect(await getRemoteImage('not a url', request)).toBeNull();
    expect(await getRemoteImage('http://cdn.example.com/a.png', request)).toBeNull();
    expect(await getRemoteImage('https://user:pass@cdn.example.com/a.png', request)).toBeNull();
    expect(await getRemoteImage('https://localhost/a.png', request)).toBeNull();
    expect(await getRemoteImage('https://10.0.0.1/a.png', request)).toBeNull();
    expect(await getRemoteImage(`https://${'a'.repeat(4097)}`, request)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('rejects a bracketed IPv6 literal in a private range', async () => {
    const { calls, request } = requestTo(() => image());

    expect(await getRemoteImage('https://[::1]/a.png', request)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('rejects non-string and empty input', async () => {
    const { calls, request } = requestTo(() => image());
    expect(await getRemoteImage(undefined as unknown as string, request)).toBeNull();
    expect(await getRemoteImage('', request)).toBeNull();
    expect(await fetchRemoteImageBytes('', request)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('redirects', () => {
  it('cancels the previous response and resolves relative locations', async () => {
    const first = response(302, { location: '/b.png' });
    const { calls, request } = requestTo((url) => (url.endsWith('a.png') ? first : image()));

    const res = await followImageRedirects(
      'https://cdn.example.com/a.png',
      new AbortController().signal,
      request
    );

    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(res?.status).toBe(200);
    expect(calls).toEqual(['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png']);
  });

  it('refuses a redirect without a location or with a malformed one', async () => {
    const missing = requestTo(() => response(302));
    expect(
      await followImageRedirects(URL_A, new AbortController().signal, missing.request)
    ).toBeNull();

    const malformed = requestTo(() => response(302, { location: 'http://[' }));
    expect(
      await followImageRedirects(URL_A, new AbortController().signal, malformed.request)
    ).toBeNull();
  });

  it('returns any non-redirect status', async () => {
    const { request } = requestTo(() => response(404));
    const res = await followImageRedirects(URL_A, new AbortController().signal, request);
    expect(res?.status).toBe(404);
  });

  it('logs once the redirect limit is reached', async () => {
    const { request } = requestTo(() => response(301, { location: URL_A }));

    await expect(
      followImageRedirects(URL_A, new AbortController().signal, request)
    ).resolves.toBeNull();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('remote image redirect limit reached')
    );
  });
});

describe('default transport', () => {
  it('resolves SSRF-safe addresses and applies request options', async () => {
    const res = await getRemoteImage(URL_A);

    expect(res).toMatch(/^data:image\/png;base64,/);
    expect(state.resolveNetworkTarget).toHaveBeenCalledWith(URL_A);
    expect(state.createPinnedLookup).toHaveBeenCalledWith([
      { address: '93.184.216.34', family: 4 }
    ]);
    const options = state.httpsRequest.mock.calls[0][1];
    expect(options).toMatchObject({
      lookup: 'pinned-lookup',
      headers: expect.objectContaining({ 'User-Agent': expect.any(String) })
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(state.httpsRequest.mock.calls[0][1].headers.Accept).toContain('image/');
  });

  it('rejects a resolved target that is not https', async () => {
    state.resolveNetworkTarget.mockResolvedValue({
      url: new URL('http://cdn.example.com/a.png'),
      addresses: []
    });

    expect(await getRemoteImage(URL_A)).toBeNull();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('remote image failed'),
      expect.any(Error)
    );
    expect(state.httpsRequest).not.toHaveBeenCalled();
  });

  it('rejects on a socket error', async () => {
    state.nextRequestError = new Error('socket');
    expect(await getRemoteImage(URL_A)).toBeNull();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('remote image failed'),
      state.nextRequestError
    );
  });

  it('handles header arrays', async () => {
    state.nextResponse = response(
      200,
      { 'content-type': ['image/webp', 'image/png'] as unknown as string },
      [Buffer.from('x')]
    );

    await expect(getRemoteImage(URL_A)).resolves.toMatch(/^data:image\/webp;base64,/);
  });

  it('rejects a non-image content type', async () => {
    const payload = response(200, { 'content-type': 'text/html' }, [Buffer.from('<html>')]);
    state.nextResponse = payload;

    await expect(getRemoteImage(URL_A)).resolves.toBeNull();
    expect(payload.destroy).toHaveBeenCalled();
  });
});

describe('successful downloads', () => {
  it('converts bytes to a data URL and serves the cache on repeat', async () => {
    const { calls, request } = requestTo(() => image('hello'));

    const first = await getRemoteImage(URL_A, request);
    const second = await getRemoteImage(URL_A, request);

    expect(first).toMatch(/^data:image\/png;base64,/);
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it('deduplicates in-flight requests', async () => {
    let release: ((value: RemoteImageResponse) => void) | null = null;
    const request = vi.fn(
      () =>
        new Promise<RemoteImageResponse>((resolve) => {
          release = resolve;
        })
    );

    const first = getRemoteImage(URL_A, request);
    const second = getRemoteImage(URL_A, request);
    expect(request).toHaveBeenCalledTimes(1);

    release!(image('same'));
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.stringMatching(/^data:image\/png;base64,/),
      expect.stringMatching(/^data:image\/png;base64,/)
    ]);
  });

  it('ignores when the body exceeds the limit', async () => {
    const payload = response(200, { 'content-type': 'image/png' }, [
      new Uint8Array(4 * 1024 * 1024 + 1)
    ]);

    await expect(getRemoteImage(URL_A, requestTo(() => payload).request)).resolves.toBeNull();
    expect(payload.cancel).toHaveBeenCalled();
  });

  it('returns null for empty bodies or non-2xx responses', async () => {
    const empty = response(200, { 'content-type': 'image/png' });
    await expect(getRemoteImage(URL_A, requestTo(() => empty).request)).resolves.toBeNull();

    const notFound = response(404, { 'content-type': 'image/png' }, [Buffer.from('x')]);
    await expect(getRemoteImage(URL_A, requestTo(() => notFound).request)).resolves.toBeNull();
    expect(notFound.cancel).toHaveBeenCalled();
  });

  it('returns null when the redirect chain is refused', async () => {
    const { request } = requestTo(() => response(302, { location: 'http://10.0.0.1/x' }));
    await expect(getRemoteImage(URL_A, request)).resolves.toBeNull();
  });

  it('serves cached data and expires it after the TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { calls, request } = requestTo(() => image());

    await getRemoteImage(URL_A, request);
    await getRemoteImage(URL_A, request);
    expect(calls).toHaveLength(1);

    vi.setSystemTime(new Date('2026-01-02T01:00:00Z'));
    await getRemoteImage(URL_A, request);
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
  });

  it('keeps at most the entry cap and reports cleared entries', async () => {
    const { request } = requestTo(() => image('x'));
    for (let i = 0; i < 205; i++) {
      await getRemoteImage(`${URL_A}?i=${i}`, request);
    }

    expect(clearRemoteImageCache()).toBe(200);
    expect(clearRemoteImageCache()).toBe(0);
  });
});

describe('fetchRemoteImageBytes', () => {
  it('returns raw bytes for images', async () => {
    const buf = await fetchRemoteImageBytes(URL_A, requestTo(() => image('raw')).request);
    expect(buf?.toString()).toBe('raw');
  });

  it('accepts a missing content type', async () => {
    const payload = response(200, {}, [Buffer.from('raw')]);
    await expect(fetchRemoteImageBytes(URL_A, requestTo(() => payload).request)).resolves.toEqual(
      Buffer.from('raw')
    );
  });

  it('rejects non-2xx and non-image payloads', async () => {
    const notFound = response(404, {}, [Buffer.from('x')]);
    await expect(
      fetchRemoteImageBytes(URL_A, requestTo(() => notFound).request)
    ).resolves.toBeNull();
    expect(notFound.cancel).toHaveBeenCalled();

    const html = response(200, { 'content-type': 'text/html' }, [Buffer.from('x')]);
    await expect(fetchRemoteImageBytes(URL_A, requestTo(() => html).request)).resolves.toBeNull();
    expect(html.cancel).toHaveBeenCalled();
  });

  it('returns null on refused redirects or thrown requests', async () => {
    const refused = requestTo(() => response(302, { location: 'http://localhost/x' }));
    await expect(fetchRemoteImageBytes(URL_A, refused.request)).resolves.toBeNull();

    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(fetchRemoteImageBytes(URL_A, failing)).resolves.toBeNull();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('remote image bytes failed'),
      expect.any(Error)
    );
  });

  it('rejects body limits', async () => {
    const payload = response(200, { 'content-type': 'image/png' }, [
      new Uint8Array(4 * 1024 * 1024 + 1)
    ]);
    await expect(
      fetchRemoteImageBytes(URL_A, requestTo(() => payload).request)
    ).resolves.toBeNull();
  });
});

describe('readRemoteImageBody', () => {
  it('ignores a non-numeric content length', async () => {
    const payload = response(200, { 'content-length': 'lots' }, [Buffer.from('abc')]);
    await expect(readRemoteImageBody(payload)).resolves.toEqual(Buffer.from('abc'));
  });

  it('cancels when the declared length is too large', async () => {
    const payload = response(200, { 'content-length': String(4 * 1024 * 1024 + 1) });
    await expect(readRemoteImageBody(payload)).resolves.toBeNull();
    expect(payload.cancel).toHaveBeenCalled();
  });
});

describe('registerRemoteImageHandler', () => {
  it('serves cached images through IPC', async () => {
    const { request } = requestTo(() => image('ipc'));
    const data = await getRemoteImage(URL_A, request);
    registerRemoteImageHandler();

    expect(state.handler).toBeTypeOf('function');
    await expect(state.handler({}, URL_A)).resolves.toBe(data);
    await expect(state.handler({}, 'http://localhost/x')).resolves.toBeNull();
  });
});
