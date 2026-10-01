import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('../cover/cover-cache', () => ({ getStore: async () => ({ get: () => undefined }) }));
vi.mock('../settings/settings-crypto', () => ({ decryptApiKeys: async (keys: unknown) => keys }));
vi.mock('../network-target', () => ({
  privateNetworkAllowedForTarget: (
    targetUrl: string,
    trustedOrigin: string,
    userApproved: boolean
  ) => userApproved && new URL(targetUrl).origin === new URL(trustedOrigin).origin,
  resolveNetworkTarget: async (url: string) => ({
    url: new URL(url),
    addresses: [{ address: '127.0.0.1', family: 4 }]
  }),
  createPinnedLookup:
    () =>
    (
      _hostname: string,
      _options: unknown,
      callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void
    ) =>
      callback(null, '127.0.0.1', 4)
}));

const { httpJsonFetch } = await import('../generic-fetch');

interface Received {
  path: string;
  headers: http.IncomingHttpHeaders;
  method: string;
}

const servers: http.Server[] = [];

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ origin: string; received: Received[] }> {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    received.push({ path: req.url || '/', headers: req.headers, method: req.method || 'GET' });
    handler(req, res);
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, received });
    });
  });
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe('httpJsonFetch redirects', () => {
  it('keeps auth headers on a same-origin redirect', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { location: '/api' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });

    const result = await httpJsonFetch(`${server.origin}/start`, {
      method: 'GET',
      headers: { Authorization: 'Bearer secret' },
      allowPrivateNetwork: true
    });

    expect(result.status).toBe(200);
    expect(server.received[1].headers.authorization).toBe('Bearer secret');
  });

  it('drops auth headers when a redirect crosses origins', async () => {
    const target = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    const front = await startServer((_req, res) => {
      res.writeHead(302, { location: `${target.origin}/steal` });
      res.end();
    });

    const result = await httpJsonFetch(`${front.origin}/start`, {
      method: 'GET',
      headers: { Authorization: 'Bearer secret', 'X-Api-Key': 'k' },
      allowPrivateNetwork: true
    });

    expect(result.status).toBe(200);
    const hop = target.received[0];
    expect(hop.headers.authorization).toBeUndefined();
    expect(hop.headers['x-api-key']).toBeUndefined();
    // Bezpieczne domyślne wartości nadal wędrują.
    expect(hop.headers['user-agent']).toBe('Onda/1.0');
  });

  it('refuses a cross-origin redirect of a POST instead of replaying the body', async () => {
    const target = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    const front = await startServer((_req, res) => {
      res.writeHead(307, { location: `${target.origin}/steal` });
      res.end();
    });

    await expect(
      httpJsonFetch(`${front.origin}/start`, {
        method: 'POST',
        headers: { Authorization: 'Bearer secret' },
        body: '{"q":"x"}',
        allowPrivateNetwork: true
      })
    ).rejects.toThrow(/Cross-origin redirect refused/);
    expect(target.received).toHaveLength(0);
  });
});
