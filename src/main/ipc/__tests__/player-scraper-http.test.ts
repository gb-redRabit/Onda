import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('../network-target', () => ({
  privateNetworkAllowedForTarget: (targetUrl: string, trustedOrigin: string, approved: boolean) =>
    approved && new URL(targetUrl).origin === new URL(trustedOrigin).origin,
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

const { fetchPageText } = await import('../player-scraper');

interface RequestRecord {
  url: string;
  authorization?: string;
  apiKey?: string;
}

const servers: http.Server[] = [];

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ origin: string; requests: RequestRecord[] }> {
  const requests: RequestRecord[] = [];
  const server = http.createServer((req, res) => {
    requests.push({
      url: req.url || '/',
      authorization: req.headers.authorization,
      apiKey: req.headers['x-api-key'] as string | undefined
    });
    handler(req, res);
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, requests });
    });
  });
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe('player scraper HTTP hardening', () => {
  it('stops a redirect loop at the configured hop limit', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(302, { location: '/loop' });
      res.end();
    });

    await expect(fetchPageText(`${server.origin}/loop`, {})).rejects.toThrow(/Too many redirects/);
    expect(server.requests).toHaveLength(6);
  });

  it('strips API credentials when the page redirects to a different origin', async () => {
    const target = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>ok</html>');
    });
    const front = await startServer((_req, res) => {
      res.writeHead(302, { location: `${target.origin}/page` });
      res.end();
    });

    await expect(
      fetchPageText(`${front.origin}/start`, { Authorization: 'Bearer secret', 'X-Api-Key': 'k' })
    ).resolves.toContain('ok');
    expect(target.requests[0].authorization).toBeUndefined();
    expect(target.requests[0].apiKey).toBeUndefined();
  });
});
