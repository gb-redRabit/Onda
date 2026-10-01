import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { downloadHttpFile } from '../http-downloader';

// Każdy błąd usuwał `.part`, więc połączenie zerwane po
// 4 GB z 10 GB pliku oznaczało start od zera — a wstrzymanie zadania wyrzucało
// także jego postęp, bo wstrzymanie jest przerwaniem. Plik częściowy teraz
// przetrwa wszystko, z czego sieć może się podnieść, i jest usuwany tylko wtedy, gdy
// ponowienie nie pomoże.

const TRUST = { allowPrivateNetwork: true } as const;
const servers: http.Server[] = [];
const tempDirs: string[] = [];
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function startServer(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function scratch(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `onda-part-${name}-`));
  tempDirs.push(dir);
  return join(dir, 'file.bin');
}

async function partSize(destPath: string): Promise<number> {
  return stat(`${destPath}.part`)
    .then((s) => s.size)
    .catch(() => -1);
}

/** Czeka na unlink, który następuje w zdarzeniu close strumienia zapisu. */
async function waitForPartGone(destPath: string): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await partSize(destPath)) === -1) return true;
    await delay(20);
  }
  return false;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('a failed download keeps what it can', () => {
  it('keeps the .part after a dropped connection', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4096' });
      res.write('a'.repeat(256));
      // Natychmiastowe zniszczenie zresetowałoby gniazdo, zanim klient odczyta
      // ciało, i nie byłoby czego zachować. To opóźnienie sprawia, że
      // jest to "połączenie zerwane w połowie", a nie odmowa.
      setTimeout(() => res.destroy(), 80);
    });
    const destPath = await scratch('reset');
    await expect(downloadHttpFile({ url: `${origin}/f`, destPath, ...TRUST })).rejects.toThrow();
    await delay(300);
    expect(await partSize(destPath)).toBe(256);
  });

  it('keeps the .part when the server says to come back', async () => {
    for (const status of [429, 503]) {
      const origin = await startServer((_req, res) => {
        res.writeHead(status).end();
      });
      const destPath = await scratch(`retry-${status}`);
      // Zacznij od pliku częściowego, jakiego zostawiłaby poprzednia próba.
      await writeFile(`${destPath}.part`, 'partial');
      await expect(downloadHttpFile({ url: `${origin}/f`, destPath, ...TRUST })).rejects.toThrow();
      expect(await partSize(destPath), `status ${status}`).toBe(7);
    }
  });

  it('keeps the .part on an abort, so a paused job resumes', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      const pump = (n: number): void => {
        if (n === 0) return;
        res.write('b'.repeat(128));
        setTimeout(() => pump(n - 1), 20);
      };
      pump(200);
    });
    const destPath = await scratch('paused');
    const controller = new AbortController();
    const promise = downloadHttpFile({
      url: `${origin}/f`,
      destPath,
      signal: controller.signal,
      ...TRUST
    });
    setTimeout(() => controller.abort(), 150);

    await expect(promise).rejects.toThrow(/Aborted/);
    await delay(200);
    expect(await partSize(destPath)).toBeGreaterThan(0);
  });
});

describe('a hopeless failure still discards the .part', () => {
  it('removes it when the server refuses the request', async () => {
    for (const status of [400, 403, 404, 410]) {
      const origin = await startServer((_req, res) => {
        res.writeHead(status).end();
      });
      const destPath = await scratch(`gone-${status}`);
      await writeFile(`${destPath}.part`, 'partial');
      await expect(
        downloadHttpFile({ url: `${origin}/f`, destPath, ...TRUST }),
        `status ${status}`
      ).rejects.toThrow(new RegExp(`HTTP ${status}`));
      expect(await waitForPartGone(destPath), `status ${status}`).toBe(true);
    }
  });

  it('removes it when the file is over the ceiling', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4096' });
      res.end('x'.repeat(4096));
    });
    const destPath = await scratch('toolarge');
    await writeFile(`${destPath}.part`, 'partial');
    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath, maxBytes: 1024, ...TRUST })
    ).rejects.toThrow(/too large/i);
    expect(await waitForPartGone(destPath)).toBe(true);
  });

  it('removes it when a resumed file is rejected as too large in total', async () => {
    // Prefiks liczy się do pułapu, więc istniejący .part może wypchnąć
    // sumę ponad limit, nawet gdy samo pozostałe ciało by tego nie zrobiło.
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4096' });
      res.end('x'.repeat(4096));
    });
    const destPath = await scratch('resumed-toolarge');
    await writeFile(`${destPath}.part`, 'p'.repeat(900));
    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath, maxBytes: 1024, ...TRUST })
    ).rejects.toThrow(/too large/i);
    expect(await waitForPartGone(destPath)).toBe(true);
  });
});

describe('a resumed download really resumes', () => {
  it('asks for the rest of the file and joins the two halves', async () => {
    let rangeHeader: string | undefined;
    const body = 'c'.repeat(2048);
    const origin = await startServer((req, res) => {
      rangeHeader = req.headers.range;
      if (rangeHeader) {
        const start = Number(/bytes=(\d+)-/.exec(rangeHeader)?.[1] ?? 0);
        res.writeHead(206, { 'content-length': String(body.length - start) });
        res.end(body.slice(start));
      } else {
        res.writeHead(200, { 'content-length': String(body.length) });
        res.end(body);
      }
    });
    const destPath = await scratch('resume');
    await writeFile(`${destPath}.part`, 'a'.repeat(1024));

    await downloadHttpFile({ url: `${origin}/f`, destPath, ...TRUST });

    expect(rangeHeader).toBe('bytes=1024-');
    expect(await readFile(destPath, 'utf-8')).toBe('a'.repeat(1024) + body.slice(1024));
  });
});
