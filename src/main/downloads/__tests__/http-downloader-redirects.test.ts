import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { downloadHttpFile } from '../http-downloader';

const TRUST = { allowPrivateNetwork: true } as const;
const servers: http.Server[] = [];
const tempDirs: string[] = [];

async function startServer(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function scratch(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `onda-http-extra-${name}-`));
  tempDirs.push(dir);
  return join(dir, 'file.bin');
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((r) => server.close(() => r())))
  );
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('redirects', () => {
  it('follows same-origin redirects and downloads the final body', async () => {
    const origin = await startServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { location: '/middle' });
        res.end();
        return;
      }
      if (req.url === '/middle') {
        res.writeHead(301, { location: '/final' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-length': '5' });
      res.end('hello');
    });
    const dest = await scratch('redirect');

    await downloadHttpFile({ url: `${origin}/start`, destPath: dest, ...TRUST });

    await expect(readFile(dest, 'utf-8')).resolves.toBe('hello');
  });

  it('rejects a redirect loop after the retry budget and drops the partial file', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(302, { location: '/loop' });
      res.end();
    });
    const dest = await scratch('loop');

    await expect(
      downloadHttpFile({ url: `${origin}/loop`, destPath: dest, ...TRUST })
    ).rejects.toThrow(/Too many redirects/i);
  });
});

describe('resume edge cases', () => {
  it('restarts from zero when the server ignores the Range header', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4' });
      res.end('full');
    });
    const dest = await scratch('range-ignored');
    await writeFile(`${dest}.part`, 'stale-prefix');

    await downloadHttpFile({ url: `${origin}/f`, destPath: dest, ...TRUST });

    await expect(readFile(dest, 'utf-8')).resolves.toBe('full');
  });
});

describe('request lifecycle guards', () => {
  it('aborts before any network work when the signal is already aborted', async () => {
    const dest = await scratch('pre-aborted');
    const controller = new AbortController();
    controller.abort();

    await expect(
      downloadHttpFile({
        url: 'http://127.0.0.1:1/never',
        destPath: dest,
        signal: controller.signal,
        ...TRUST
      })
    ).rejects.toThrow(/Aborted/);
  });

  it('times out when the server never answers', async () => {
    const origin = await startServer(() => {
      // Celowo nie odpowiada.
    });
    const dest = await scratch('timeout');

    await expect(
      downloadHttpFile({ url: `${origin}/hang`, destPath: dest, timeoutMs: 50, ...TRUST })
    ).rejects.toThrow(/Timeout/);
  });

  it('propagates a connection error and cleans the pending request', async () => {
    const server = http.createServer((_req, res) => {
      res.destroy();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const dest = await scratch('reset');

    await expect(
      downloadHttpFile({ url: `http://127.0.0.1:${port}/reset`, destPath: dest, ...TRUST })
    ).rejects.toThrow();
  });
});
