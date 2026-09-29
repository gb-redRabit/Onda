import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { createMediaServer, type MediaServer } from '../media-server';
import { registerGenericStreamUrl } from '../media-server-stream-registry';

vi.mock('../ipc/network-target', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ipc/network-target')>();
  return {
    ...actual,
    resolveNetworkTarget: vi.fn(async (rawUrl: string) => {
      const url = new URL(rawUrl);
      if (url.hostname === 'private.example') {
        throw new Error('Private network address is not allowed');
      }
      return { url, addresses: [{ address: '127.0.0.1', family: 4 as const }] };
    })
  };
});

let mediaServer: MediaServer;

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function requestStream(rawUrl: string, range?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: mediaServer.port,
        path: `/${mediaServer.token}/stream?url=${encodeURIComponent(rawUrl)}`,
        headers: range ? { range } : undefined
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
  });
}

function audioResponse(res: http.ServerResponse): void {
  res.writeHead(206, {
    'content-type': 'audio/mpeg',
    'content-range': 'bytes 0-3/4',
    'content-length': '4',
    'accept-ranges': 'bytes'
  });
  res.end('TEST');
}

beforeAll(async () => {
  mediaServer = await createMediaServer();
});

afterAll(() => {
  mediaServer?.close();
});

describe('media-server generic stream proxy', () => {
  it('proxies a registered generic stream and forwards byte ranges', async () => {
    let receivedRange: string | undefined;
    const upstream = http.createServer((req, res) => {
      receivedRange = req.headers.range;
      audioResponse(res);
    });
    const port = await listen(upstream);
    const url = `http://stream.example:${port}/audio`;

    try {
      await registerGenericStreamUrl(url);
      const result = await requestStream(url, 'bytes=0-3');

      expect(result).toEqual({ status: 206, body: 'TEST' });
      expect(receivedRange).toBe('bytes=0-3');
    } finally {
      await close(upstream);
    }
  });

  it('revalidates redirects and blocks a redirect to a private target', async () => {
    let mediaRequests = 0;
    let upstreamPort = 0;
    const upstream = http.createServer((req, res) => {
      if (req.url === '/public-redirect') {
        res.writeHead(302, { location: `http://cdn.example:${upstreamPort}/audio` });
        res.end();
        return;
      }
      if (req.url === '/private-redirect') {
        res.writeHead(302, { location: `http://private.example:${upstreamPort}/audio` });
        res.end();
        return;
      }
      mediaRequests++;
      audioResponse(res);
    });
    upstreamPort = await listen(upstream);
    const publicUrl = `http://source.example:${upstreamPort}/public-redirect`;
    const privateUrl = `http://source.example:${upstreamPort}/private-redirect`;

    try {
      await registerGenericStreamUrl(publicUrl);
      await registerGenericStreamUrl(privateUrl);

      await expect(requestStream(publicUrl)).resolves.toEqual({ status: 206, body: 'TEST' });
      expect(mediaRequests).toBe(1);

      await expect(requestStream(privateUrl)).resolves.toEqual({
        status: 403,
        body: 'forbidden'
      });
      expect(mediaRequests).toBe(1);
    } finally {
      await close(upstream);
    }
  });
});
