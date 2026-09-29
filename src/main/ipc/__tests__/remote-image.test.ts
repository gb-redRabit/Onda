import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const { followImageRedirects, getRemoteImage, clearRemoteImageCache, readRemoteImageBody } =
  await import('../remote-image');
const { isNonPublicAddress } = await import('../network-target');
type RemoteImageResponse = import('../remote-image').RemoteImageResponse;

type RequestCall = { url: string };

function bodyFromChunks(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    }
  };
}

function response(
  status: number,
  headers: Record<string, string> = {},
  chunks: Uint8Array[] = []
): RemoteImageResponse {
  return { status, headers, body: bodyFromChunks(chunks), cancel: vi.fn() };
}

function mockRequest(
  handler: (url: string) => RemoteImageResponse | Promise<RemoteImageResponse>
): {
  calls: RequestCall[];
  request: (url: string) => Promise<RemoteImageResponse>;
} {
  const calls: RequestCall[] = [];
  const request = async (url: string): Promise<RemoteImageResponse> => {
    calls.push({ url });
    return handler(url);
  };
  return { calls, request };
}

function redirect(to: string): RemoteImageResponse {
  return response(302, { location: to });
}

function image(body = 'x'): RemoteImageResponse {
  return response(200, { 'content-type': 'image/png' }, [Buffer.from(body)]);
}

afterEach(() => {
  clearRemoteImageCache();
});

describe('remote-image redirects', () => {
  it('validates every hop and refuses a redirect into a private host', async () => {
    const { calls, request } = mockRequest((url) => {
      if (url === 'https://cdn.example.com/a.png') return redirect('http://127.0.0.1:9/steal');
      throw new Error('must not fetch ' + url);
    });

    const res = await followImageRedirects(
      'https://cdn.example.com/a.png',
      new AbortController().signal,
      request
    );

    expect(res).toBeNull();
    // Only the first (allowlisted) hop was requested.
    expect(calls.map((c) => c.url)).toEqual(['https://cdn.example.com/a.png']);
    expect(calls[0].url).toBe('https://cdn.example.com/a.png');
  });

  it('follows an allowlisted redirect chain', async () => {
    const { calls, request } = mockRequest((url) => {
      if (url === 'https://cdn.example.com/a.png')
        return redirect('https://cdn2.example.com/b.png');
      return image();
    });

    const res = await followImageRedirects(
      'https://cdn.example.com/a.png',
      new AbortController().signal,
      request
    );

    expect(res?.status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual([
      'https://cdn.example.com/a.png',
      'https://cdn2.example.com/b.png'
    ]);
  });

  it('gives up after the redirect limit', async () => {
    const { request } = mockRequest(() => redirect('https://cdn.example.com/loop.png'));

    const res = await followImageRedirects(
      'https://cdn.example.com/a.png',
      new AbortController().signal,
      request
    );

    expect(res).toBeNull();
  });

  it('returns null (no request) for a private URL before any fetch', async () => {
    const { calls, request } = mockRequest(() => image());

    const data = await getRemoteImage('https://169.254.169.254/latest/meta-data/', request);

    expect(data).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns a data URL for an image reached through an allowlisted redirect', async () => {
    clearRemoteImageCache();
    const { request } = mockRequest((url) =>
      url.endsWith('a.png') ? redirect('https://cdn2.example.com/b.png') : image()
    );

    const data = await getRemoteImage('https://cdn.example.com/a.png', request);

    expect(data).toMatch(/^data:image\/png;base64,/);
  });
});

describe('remote-image body limit', () => {
  it('rejects an oversized Content-Length before reading the body', async () => {
    const res = response(200, { 'content-length': String(4 * 1024 * 1024 + 1) });

    await expect(readRemoteImageBody(res)).resolves.toBeNull();
    expect(res.cancel).toHaveBeenCalledOnce();
  });

  it('aborts a chunked response once its streamed size exceeds the cap', async () => {
    const oversizedChunk = new Uint8Array(4 * 1024 * 1024 + 1);
    const res = response(200, {}, [oversizedChunk]);

    await expect(readRemoteImageBody(res)).resolves.toBeNull();
    expect(res.cancel).toHaveBeenCalledOnce();
  });

  it('rejects DNS-resolved private addresses and mapped IPv4 targets', () => {
    expect(isNonPublicAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isNonPublicAddress('169.254.169.254')).toBe(true);
  });
});
