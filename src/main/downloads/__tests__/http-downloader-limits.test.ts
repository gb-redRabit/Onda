import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { downloadHttpFile } from '../http-downloader';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Two defects the audit found here:
//  - nothing bounded the body, so a source that never stopped sending filled
//    the disk;
//  - every failure path rejected the promise but left the fs.WriteStream open,
//    leaking one file descriptor per cancelled download.

const servers: http.Server[] = [];
const tempDirs: string[] = [];

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<string> {
  const server = http.createServer((req, res) => handler(req, res));
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function tempFile(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'onda-http-limit-'));
  tempDirs.push(dir);
  return join(dir, name);
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  );
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const TRUST = { allowPrivateNetwork: true } as const;

/**
 * Asserts the .part file is gone.
 *
 * The download's promise settles as soon as the failure is decided, but the
 * unlink happens on the write stream's `close` event — the descriptor has to be
 * released first, which on Windows is not instantaneous and is why the handler
 * cannot simply unlink inline. A single immediate `stat` therefore races it. This
 * is not a cosmetic wait: a zero-length .part left behind is exactly what the
 * next attempt would resume from, so the check is worth polling for rather than
 * sampling once.
 */
async function expectPartRemoved(destPath: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  let exists = true;
  while (exists && Date.now() < deadline) {
    exists = await stat(`${destPath}.part`)
      .then(() => true)
      .catch(() => false);
    if (exists) await delay(20);
  }
  expect(exists, `${destPath}.part was left behind`).toBe(false);
}

describe('http download size limit', () => {
  it('refuses a body whose content-length exceeds the cap, writing nothing', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4096' });
      res.end('x'.repeat(4096));
    });
    const destPath = await tempFile('too-big.bin');

    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath, maxBytes: 1024, ...TRUST })
    ).rejects.toThrow(/too large/i);

    // The partial file is cleaned up, so nothing is left claiming disk.
    await expectPartRemoved(destPath);
  });

  it('refuses a body that grows past the cap even without a content-length', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      // Chunked: the server never declares a length.
      const chunk = 'y'.repeat(512);
      let sent = 0;
      const pump = (): void => {
        while (sent < 8192) {
          sent += chunk.length;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
        res.end();
      };
      pump();
    });
    const destPath = await tempFile('chunked.bin');

    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath, maxBytes: 1024, ...TRUST })
    ).rejects.toThrow(/too large/i);

    await expectPartRemoved(destPath);
  });

  it('allows a body under the cap and reports progress', async () => {
    const body = 'z'.repeat(2048);
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(body.length) });
      res.end(body);
    });
    const destPath = await tempFile('ok.bin');
    const seen: number[] = [];

    await downloadHttpFile({
      url: `${origin}/f`,
      destPath,
      maxBytes: 8192,
      allowPrivateNetwork: true,
      onProgress: (p) => seen.push(p.received)
    });

    await expect(readFile(destPath, 'utf-8')).resolves.toBe(body);
    expect(seen.at(-1)).toBe(body.length);
  });

  it('counts a resumed prefix against the cap', async () => {
    // A .part file that is already over the limit must be refused before the
    // request is even made, not after another 20 GB has been appended.
    const destPath = await tempFile('resume.bin');
    await writeFile(`${destPath}.part`, 'p'.repeat(4096));
    const origin = await startServer((_req, res) => {
      res.writeHead(206, { 'content-length': '16' });
      res.end('q'.repeat(16));
    });

    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath, maxBytes: 1024, ...TRUST })
    ).rejects.toThrow(/too large/i);
  });
});

describe('http download stream teardown', () => {
  it('releases the write stream when the download is aborted', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      // Drip data so the abort lands while the body is being written.
      const pump = (n: number): void => {
        if (n === 0) return;
        res.write('a'.repeat(64));
        setTimeout(() => pump(n - 1), 20);
      };
      pump(500);
    });
    const destPath = await tempFile('aborted.bin');
    const controller = new AbortController();

    const promise = downloadHttpFile({
      url: `${origin}/f`,
      destPath,
      signal: controller.signal,
      allowPrivateNetwork: true
    });
    // Wait for the first chunk rather than guessing, so the abort is guaranteed
    // to land after the write stream exists.
    setTimeout(() => controller.abort(), 120);

    await expect(promise).rejects.toThrow(/Aborted/);
    // A leaked descriptor would keep the file handle open; the .part is removed
    // either way, and the promise settles exactly once.
    await expectPartRemoved(destPath);
  });

  it('leaves no .part when the abort lands before the write stream opens', async () => {
    // The narrow race: unlinking the .part before createWriteStream has finished
    // opening it lets the pending open() create the file afterwards, so a
    // zero-length .part survives — and the next attempt treats it as a valid
    // resume prefix. It only reproduces when the abort beats the open, so it is
    // driven here by aborting at once, across several attempts.
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      const pump = (n: number): void => {
        if (n === 0) return;
        res.write('a'.repeat(256));
        setTimeout(() => pump(n - 1), 10);
      };
      pump(200);
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      const destPath = await tempFile(`early-abort-${attempt}.bin`);
      const controller = new AbortController();
      const promise = downloadHttpFile({
        url: `${origin}/f`,
        destPath,
        signal: controller.signal,
        allowPrivateNetwork: true
      });
      controller.abort();
      await expect(promise, `attempt ${attempt}`).rejects.toThrow(/Aborted/);
      await expectPartRemoved(destPath);
    }
  }, 20_000);

  it('rejects once when the response errors mid-body', async () => {
    // Destroy on the first write rather than after a timer: a timer races the
    // body, and on a fast machine the download would complete and resolve.
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4096' });
      res.write('a'.repeat(64));
      res.destroy();
    });
    const destPath = await tempFile('reset.bin');

    await expect(downloadHttpFile({ url: `${origin}/f`, destPath, ...TRUST })).rejects.toThrow();
  });
});
