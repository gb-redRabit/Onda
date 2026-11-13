import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  httpRequest: vi.fn(),
  urlAllowed: vi.fn()
}));

vi.mock('../http-request', () => ({ httpRequest: h.httpRequest }));
vi.mock('../plugins/plugins-guards', () => ({ urlAllowed: h.urlAllowed }));
vi.mock('../plugins/plugins-core', () => ({
  MAX_FETCH_BYTES: 1000,
  MAX_FETCH_TEXT_BYTES: 100,
  MAX_FETCH_REDIRECTS: 3,
  DEFAULT_FETCH_TIMEOUT_MS: 5000,
  MAX_FETCH_TIMEOUT_MS: 10000
}));

import { runPluginFetch } from '../plugins/plugins-fetch';

function response(text: string, over: Record<string, unknown> = {}) {
  return {
    text,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/plain' },
    ...over
  };
}

beforeEach(() => {
  h.urlAllowed.mockReset().mockReturnValue(true);
  h.httpRequest.mockReset().mockResolvedValue(response('body'));
});

describe('runPluginFetch', () => {
  it('rejects unsupported methods', async () => {
    await expect(
      runPluginFetch([], 'https://a.test', { method: 'TRACE' as never })
    ).resolves.toEqual({ success: false, error: 'Invalid method', code: 'invalid-url' });
    expect(h.httpRequest).not.toHaveBeenCalled();
  });

  it('rejects URLs outside the allowlist', async () => {
    h.urlAllowed.mockReturnValue(false);

    await expect(runPluginFetch(['https://a.test/*'], 'https://b.test', {})).resolves.toEqual({
      success: false,
      error: 'URL not permitted by plugin allowlist',
      code: 'forbidden'
    });
    expect(h.httpRequest).not.toHaveBeenCalled();
  });

  it('performs a GET request with defaults', async () => {
    await expect(runPluginFetch([], 'https://a.test', {})).resolves.toMatchObject({
      success: true,
      status: 200,
      statusText: 'OK',
      data: 'body'
    });

    expect(h.httpRequest).toHaveBeenCalledWith(
      'https://a.test',
      expect.objectContaining({
        method: 'GET',
        headers: {},
        defaultHeaders: { 'User-Agent': 'Onda-plugin/1.0' },
        body: undefined,
        timeoutMs: 5000,
        maxBytes: 1000,
        maxRedirects: 3
      })
    );
  });

  it('uppercases the method and serialises the body', async () => {
    await runPluginFetch([], 'https://a.test', {
      method: 'post' as never,
      headers: { a: 'b' },
      body: { x: 1 },
      timeoutMs: 2000
    });

    expect(h.httpRequest).toHaveBeenCalledWith(
      'https://a.test',
      expect.objectContaining({
        method: 'POST',
        headers: { a: 'b' },
        body: '{"x":1}',
        timeoutMs: 2000
      })
    );
  });

  it('caps the timeout and ignores non-positive values', async () => {
    await runPluginFetch([], 'https://a.test', { timeoutMs: 99999 });
    expect(h.httpRequest).toHaveBeenLastCalledWith(
      'https://a.test',
      expect.objectContaining({ timeoutMs: 10000 })
    );

    await runPluginFetch([], 'https://a.test', { timeoutMs: -5 });
    expect(h.httpRequest).toHaveBeenLastCalledWith(
      'https://a.test',
      expect.objectContaining({ timeoutMs: 5000 })
    );
  });

  it('parses JSON responses', async () => {
    h.httpRequest.mockResolvedValue(response('{"a":1}'));

    await expect(
      runPluginFetch([], 'https://a.test', { responseType: 'json' })
    ).resolves.toMatchObject({ success: true, data: { a: 1 } });
  });

  it('returns null for an empty JSON response', async () => {
    h.httpRequest.mockResolvedValue(response(''));

    await expect(
      runPluginFetch([], 'https://a.test', { responseType: 'json' })
    ).resolves.toMatchObject({ success: true, data: null });
  });

  it('reports invalid JSON', async () => {
    h.httpRequest.mockResolvedValue(response('{'));

    await expect(runPluginFetch([], 'https://a.test', { responseType: 'json' })).resolves.toEqual({
      success: false,
      error: 'Invalid JSON response',
      code: 'unknown'
    });
  });

  it('rejects responses above the text limit', async () => {
    h.httpRequest.mockResolvedValue(response('x'.repeat(101)));

    await expect(runPluginFetch([], 'https://a.test', {})).resolves.toEqual({
      success: false,
      error: 'Response too large',
      code: 'too-large'
    });
  });

  it.each([
    ['Timeout', 'timeout'],
    ['Response too large', 'too-large'],
    ['Too many redirects', 'redirect-loop'],
    ['Redirect not allowed', 'redirect-loop'],
    ['Cross-origin redirect refused', 'redirect-loop'],
    ['Private network address is not allowed', 'forbidden'],
    ['socket hang up', 'network']
  ])('classifies transport error %s', async (message, code) => {
    h.httpRequest.mockRejectedValue(new Error(message));

    await expect(runPluginFetch([], 'https://a.test', {})).resolves.toEqual({
      success: false,
      error: message,
      code
    });
  });

  it('stringifies non-Error transport failures', async () => {
    h.httpRequest.mockRejectedValue('plain failure');

    await expect(runPluginFetch([], 'https://a.test', {})).resolves.toEqual({
      success: false,
      error: 'plain failure',
      code: 'network'
    });
  });

  it('checks redirects against the allowlist', async () => {
    await runPluginFetch(['https://a.test/*'], 'https://a.test', {});

    const options = h.httpRequest.mock.calls[0][1] as { onRedirect: (u: string) => boolean };
    h.urlAllowed.mockReturnValue(false);
    expect(options.onRedirect('https://evil.test')).toBe(false);
    h.urlAllowed.mockReturnValue(true);
    expect(options.onRedirect('https://a.test/next')).toBe(true);
  });
});
