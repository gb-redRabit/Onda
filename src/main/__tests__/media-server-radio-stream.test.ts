import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import { isIP } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'net';
import type { NetworkTargetOptions } from '../ipc/network-target';
import { createMediaServer, type MediaServer } from '../media/media-server';

// Stacja radiowa to host dodany przez użytkownika, a `/stream` jest osiągalny z
// renderera — więc stacja rozwiązująca się do prywatnego adresu zamieniała media
// server w forwarder żądań (usługi loopback, 169.254.169.254). Proxy
// teraz rozwiązuje i przypina cele stacji na każdym przeskoku, tak jak ogólna
// ścieżka już to robiła.

/** Zastępuje DNS: na jaki adres rozwiązuje się każdy host w tym teście. */
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
    // Stub WALIDUJE symulowaną odpowiedź DNS, ale PRZYPINA do lokalnego
    // upstreamu, więc przypięte wyszukiwanie proxy wciąż trafia do serwera testowego
    // zamiast do prawdziwego adresu internetowego.
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

/**
 * Store radia zapisuje prawdziwy plik, więc potrzebuje prawdziwego katalogu — i
 * nie może to być repozytorium. `process.env.TEMP` istnieje tylko na Windows; na
 * Linux/macOS jest nieustawiony, a fallback `'.'` wrzucał `onda-radio-test.json`
 * do korzenia repo, co potem psuło `prettier --check` przy każdym uruchomieniu CI.
 */
let radioDir = '';

function radioFile(): string {
  return join(radioDir, 'radios.json');
}

/** Rejestruje stację przez prawdziwy store, więc allowlista proxy się synchronizuje. */
async function addStation(host: string): Promise<void> {
  await radio.persistRadio(radioFile(), [
    { id: 'station-1', name: 'Test', url: `http://${host}:${upstreamPort}/audio`, addedAt: 1 }
  ]);
  const loaded = await radio.loadRadioData(radioFile());
  expect(loaded).toHaveLength(1);
  expect(radio.isAllowedRadioHost(host)).toBe(true);
}

beforeAll(async () => {
  radioDir = await mkdtemp(join(tmpdir(), 'onda-radio-'));
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
  if (radioDir) await rm(radioDir, { recursive: true, force: true });
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
