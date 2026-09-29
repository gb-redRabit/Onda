import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { downloadHttpFile } from '../http-downloader';

const servers: http.Server[] = [];
const tempDirs: string[] = [];

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ origin: string; requests: string[] }> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url || '/');
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

async function tempFile(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'onda-http-download-'));
  tempDirs.push(dir);
  return join(dir, name);
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  );
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('direct source downloads and private-network guard', () => {
  it('blocks loopback by default and permits it only with explicit per-source trust', async () => {
    const server = await startServer((_req, res) => res.end('local media'));
    const blockedPath = await tempFile('blocked.bin');
    await expect(
      downloadHttpFile({ url: `${server.origin}/file`, destPath: blockedPath })
    ).rejects.toThrow(/Private network address/);
    expect(server.requests).toHaveLength(0);

    const allowedPath = await tempFile('allowed.bin');
    await downloadHttpFile({
      url: `${server.origin}/file`,
      destPath: allowedPath,
      allowPrivateNetwork: true
    });
    await expect(readFile(allowedPath, 'utf-8')).resolves.toBe('local media');
    expect(server.requests).toHaveLength(1);
  });

  it('rejects a redirect from a trusted source to a different private origin', async () => {
    const target = await startServer((_req, res) => res.end('must not download'));
    const front = await startServer((_req, res) => {
      res.writeHead(302, { location: `${target.origin}/file` });
      res.end();
    });
    const destPath = await tempFile('redirect.bin');

    await expect(
      downloadHttpFile({
        url: `${front.origin}/redirect`,
        destPath,
        allowPrivateNetwork: true
      })
    ).rejects.toThrow(/Private network address/);
    expect(front.requests).toHaveLength(1);
    expect(target.requests).toHaveLength(0);
  });
});
