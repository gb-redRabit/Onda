import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { maskHeaders, httpJsonFetch } from '../generic-fetch';

describe('maskHeaders', () => {
  it('masks sensitive header values and keeps the rest', () => {
    const out = maskHeaders({
      'Content-Type': 'application/json',
      'Set-Cookie': ['a=1', 'b=2'],
      Authorization: 'Bearer secret',
      'X-API-Key': 'k',
      'x-normal': 'x'
    });
    expect(out['Content-Type']).toBe('application/json');
    expect(out['Set-Cookie']).toBe('***');
    expect(out['Authorization']).toBe('***');
    expect(out['X-API-Key']).toBe('***');
    expect(out['x-normal']).toBe('x');
  });

  it('skips undefined values', () => {
    expect(maskHeaders({ 'content-type': 'text/plain', etag: undefined })).toEqual({
      'content-type': 'text/plain'
    });
  });
});

describe('httpJsonFetch response headers', () => {
  it('returns masked response headers', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.setHeader('set-cookie', 'sid=abc');
      res.setHeader('x-demo', 'yes');
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    try {
      const res = await httpJsonFetch(`${origin}/`, {
        method: 'GET',
        headers: {},
        allowPrivateNetwork: true,
        trustedOrigin: origin
      });
      expect(res.json).toEqual({ ok: true });
      expect(res.headers['x-demo']).toBe('yes');
      expect(res.headers['set-cookie']).toBe('***');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
