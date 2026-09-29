import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import { isIP } from 'node:net';
import type { AddressInfo } from 'net';
import type { NetworkTargetOptions } from '../ipc/network-target';
import { createMediaServer, type MediaServer } from '../media-server';

// A radio station is a user-added host, and `/stream` is reachable from the
// renderer — so a station resolving to a private address turned the media
// server into a request forwarder (loopback services, 169.254.169.254). The
// proxy now resolves and pins station targets on every hop, like the generic
// path already did.

/** Stands in for DNS: which address each host in this test resolves to. */
const DNS: Record<string, string> = {
  'station.example': '93.184.216.34',
  'rebind.example': '127.0.0.1',
  'metadata.example': '169.254.169.254',
  'lan.example': '192.168.1.50'
};

vi.mock('../ipc/network-target', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ipc/network-target')>();
  return {
    ...actual,
    // The stub VALIDATES the simulated DNS answer but PINS to the local
    // upstream, so the proxy's pinned lookup still reaches the test server
    // instead of a real Internet address.
    resolveNetworkTarget: vi.fn(async (rawUrl: string, options: NetworkTargetOptions = {}) => {
      const url = new URL(rawUrl);
      const host = url.hostname;
      const answer = isIP(host) ? host : (DNS[host] ?? '93.184.216.34');
      if (actual.isNeverPublicAddress(answer)) {
        throw new Error('Loopback address is not allowed');
      }
      if (actual.isNonPublicAddress(answer) && !options.allowPrivateNetwork) {
        throw new Error('Private network address is not allowed');
      }
      return { url, addresses: [{ address: '127.0.0.1', family: 4 as const }] };
    })
  };
});

const radio = await import('../ipc/radio-store');

let mediaServer: MediaServer;
let upstream: http.Server;
let upstreamPort = 0;
let mediaRequests = 0;

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

function requestStream(rawUrl: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: mediaServer.port,
        path: `/${mediaServer.token}/stream?url=${encodeURIComponent(rawUrl)}`
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

/** Registers a station through the real store, so the proxy allowlist syncs. */
async function addStation(host: string): Promise<void> {
  const file = `${process.env.TEMP ?? process.env.TMP ?? '.'}/onda-radio-test.json`;
  await radio.persistRadio(file, [
    { id: 'station-1', name: 'Test', url: `http://${host}:${upstreamPort}/audio`, addedAt: 1 }
  ]);
  const loaded = await radio.loadRadioData(file);
  expect(loaded).toHaveLength(1);
  expect(radio.isAllowedRadioHost(host)).toBe(true);
}

beforeAll(async () => {
  mediaServer = await createMediaServer();
  upstream = http.createServer((req, res) => {
    if (req.url === '/private-redirect') {
      res.writeHead(302, { location: 'http://private.example/stream' });
      res.end();
      return;
    }
    if (req.url === '/rebind-redirect') {
      res.writeHead(302, { location: 'http://rebind.example/stream' });
      res.end();
      return;
    }
    mediaRequests++;
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': '4' });
    res.end('TEST');
  });
  upstreamPort = await listen(upstream);
});

afterAll(async () => {
  mediaServer?.close();
  await close(upstream);
});

describe('media-server radio stream proxy', () => {
  beforeEach(() => {
    mediaRequests = 0;
  });

  it('proxies a station whose host resolves to a routable address', async () => {
    await addStation('station.example');
    const url = `http://station.example:${upstreamPort}/audio`;

    await expect(requestStream(url)).resolves.toEqual({ status: 200, body: 'TEST' });
    expect(mediaRequests).toBe(1);
  });

  it('allows a station on the user LAN', async () => {
    await addStation('lan.example');
    const url = `http://lan.example:${upstreamPort}/audio`;

    await expect(requestStream(url)).resolves.toEqual({ status: 200, body: 'TEST' });
    expect(mediaRequests).toBe(1);
  });

  it('refuses a station that resolves to loopback', async () => {
    await addStation('rebind.example');
    const url = `http://rebind.example:${upstreamPort}/audio`;

    await expect(requestStream(url)).resolves.toEqual({ status: 403, body: 'forbidden' });
    expect(mediaRequests).toBe(0);
  });

  it('refuses a station that resolves to the cloud metadata endpoint', async () => {
    await addStation('metadata.example');
    const url = `http://metadata.example:${upstreamPort}/audio`;

    await expect(requestStream(url)).resolves.toEqual({ status: 403, body: 'forbidden' });
    expect(mediaRequests).toBe(0);
  });

  it('refuses a station whose redirect lands on a non-allowlisted host', async () => {
    await addStation('station.example');
    const url = `http://station.example:${upstreamPort}/private-redirect`;

    await expect(requestStream(url)).resolves.toEqual({ status: 403, body: 'forbidden' });
    expect(mediaRequests).toBe(0);
  });

  it('refuses a station whose redirect resolves to loopback', async () => {
    await addStation('station.example');
    const url = `http://station.example:${upstreamPort}/rebind-redirect`;

    await expect(requestStream(url)).resolves.toEqual({ status: 403, body: 'forbidden' });
    expect(mediaRequests).toBe(0);
  });
});
