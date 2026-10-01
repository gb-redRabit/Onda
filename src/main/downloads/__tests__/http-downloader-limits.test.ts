import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { downloadHttpFile } from '../http-downloader';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Dwa defekty znalezione tu przez audyt:
//  - nic nie ograniczało ciała odpowiedzi, więc źródło, które nigdy nie przestawało wysyłać, zapełniało
//    dysk;
//  - każda ścieżka błędu odrzucała promise, ale zostawiała fs.WriteStream otwarty,
//    wyciekając jeden deskryptor pliku na każde anulowane pobieranie.

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
 * Sprawdza, że plik .part zniknął.
 *
 * Promise pobierania kończy się, gdy tylko błąd zostanie rozstrzygnięty, ale
 * unlink następuje w zdarzeniu `close` strumienia zapisu — deskryptor musi być
 * najpierw zwolniony, co na Windows nie jest natychmiastowe i dlatego handler
 * nie może po prostu wywołać unlink w miejscu. Pojedynczy natychmiastowy `stat` więc to wyścignie. To
 * nie jest kosmetyczne oczekiwanie: pozostawiony .part o zerowej długości jest dokładnie tym,
 * od czego wznowiłaby następna próba, więc warte jest odpytywanie w pętli, a nie
 * jednokrotne sprawdzenie.
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

/** Rozmiar pliku częściowego albo -1, gdy go nie ma. */
async function partSize(destPath: string): Promise<number> {
  return stat(`${destPath}.part`)
    .then((s) => s.size)
    .catch(() => -1);
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

    // Plik częściowy jest czyszczony, więc nic nie pozostaje zajętego na dysku.
    await expectPartRemoved(destPath);
  });

  it('refuses a body that grows past the cap even without a content-length', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      // Chunked: serwer nigdy nie deklaruje długości.
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
    // Plik .part, który już przekracza limit, musi zostać odrzucony, zanim
    // żądanie w ogóle zostanie wysłane, a nie po dołączeniu kolejnych 20 GB.
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
  it('keeps the partial bytes when the download is aborted, so a retry resumes', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      // Podawaj dane kropla po kropli, aby przerwanie nastąpiło w trakcie zapisu ciała.
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
    // Czekaj na pierwszy fragment zamiast zgadywać, więc przerwanie na pewno
    // nastąpi po utworzeniu strumienia zapisu.
    setTimeout(() => controller.abort(), 120);

    await expect(promise).rejects.toThrow(/Aborted/);
    // Wstrzymane lub anulowane zadanie traciło wszystko, co pobrało. Deskryptor
    // jest zwalniany tak czy inaczej — .part po prostu zostaje na dysku.
    await delay(200);
    const size = await partSize(destPath);
    expect(size).toBeGreaterThan(0);
  });

  it('settles the promise exactly once when the abort lands before the stream opens', async () => {
    // Wąski wyścig: unlink uruchamiał się, zanim createWriteStream zdążył
    // otworzyć plik, więc oczekujące otwarcie tworzyło potem .part o zerowej długości,
    // a następna próba traktowała go jako poprawny prefiks do wznowienia. Ten
    // plik jest teraz oczekiwany — przerwanie przed pierwszym bajtem zgodnie z prawem zostawia
    // pusty .part — więc sprawdzane jest to, że przerwanie nadal jest respektowane,
    // a promise się kończy, co właśnie łamał ten wyścig.
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
    }
  }, 20_000);

  it('rejects once when the response errors mid-body and keeps what arrived', async () => {
    // Niszcz przy pierwszym zapisie, a nie po timerze: timer ściga się z
    // ciałem, a na szybkiej maszynie pobieranie zakończyłoby się i zwróciło wynik. Opóźnienie
    // jest jednak potrzebne — natychmiastowe zniszczenie resetuje gniazdo, zanim
    // klient cokolwiek odczyta, i wtedy nie ma pliku częściowego do zachowania.
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4096' });
      res.write('a'.repeat(64));
      setTimeout(() => res.destroy(), 80);
    });
    const destPath = await tempFile('reset.bin');

    await expect(downloadHttpFile({ url: `${origin}/f`, destPath, ...TRUST })).rejects.toThrow();
    // Zerwane połączenie to definicja błędu, który można ponowić, więc
    // bajty, które dotarły, zostają na dysku na następną próbę.
    await delay(300);
    expect(await partSize(destPath)).toBe(64);
  });
});
