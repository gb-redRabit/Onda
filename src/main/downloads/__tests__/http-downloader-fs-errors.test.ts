import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  actual: null as any,
  renameFail: false,
  copyFail: false,
  rmFail: false,
  statFail: false,
  onResolve: null as (() => void) | null,
  warn: vi.fn()
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  h.actual = actual;
  return {
    ...actual,
    rename: (...args: Parameters<typeof actual.rename>) =>
      h.renameFail ? Promise.reject(new Error('cross-device')) : actual.rename(...args),
    copyFile: (...args: Parameters<typeof actual.copyFile>) =>
      h.copyFail ? Promise.reject(new Error('copy failed')) : actual.copyFile(...args),
    rm: (...args: Parameters<typeof actual.rm>) =>
      h.rmFail ? Promise.reject(new Error('rm failed')) : actual.rm(...args),
    stat: (...args: Parameters<typeof actual.stat>) =>
      h.statFail ? Promise.reject(new Error('stat failed')) : actual.stat(...args)
  };
});

vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));

vi.mock('../../ipc/network-target', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ipc/network-target')>();
  return {
    ...actual,
    resolveNetworkTarget: async (...args: Parameters<typeof actual.resolveNetworkTarget>) => {
      const result = await actual.resolveNetworkTarget(...args);
      h.onResolve?.();
      return result;
    }
  };
});

import { downloadHttpFile } from '../http-downloader';

const TRUST = { allowPrivateNetwork: true } as const;
const servers: http.Server[] = [];
const tempDirs: string[] = [];
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function scratch(name: string): Promise<string> {
  const dir = await h.actual.mkdtemp(join(tmpdir(), `onda-http-fs-${name}-`));
  tempDirs.push(dir);
  return join(dir, 'file.bin');
}

async function partExists(dest: string): Promise<boolean> {
  return h.actual
    .stat(`${dest}.part`)
    .then(() => true)
    .catch(() => false);
}

beforeEach(() => {
  h.renameFail = false;
  h.copyFail = false;
  h.rmFail = false;
  h.statFail = false;
  h.onResolve = null;
  h.warn.mockClear();
});

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((r) => server.close(() => r())))
  );
  await Promise.all(
    tempDirs.splice(0).map((dir) => h.actual.rm(dir, { recursive: true, force: true }))
  );
});

describe('move and cleanup failures', () => {
  it('falls back to copy + unlink when rename fails', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4' });
      res.end('data');
    });
    const dest = await scratch('copy');
    h.renameFail = true;

    await downloadHttpFile({ url: `${origin}/f`, destPath: dest, ...TRUST });

    await expect(h.actual.readFile(dest, 'utf-8')).resolves.toBe('data');
    expect(await partExists(dest)).toBe(false);
  });

  it('keeps a non-empty partial file when it cannot be moved', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4' });
      res.end('data');
    });
    const dest = await scratch('kept');
    h.renameFail = true;
    h.copyFail = true;

    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath: dest, ...TRUST })
    ).rejects.toThrow(/copy failed/);
    await delay(50);

    expect(await partExists(dest)).toBe(true);
    expect(h.warn).toHaveBeenCalledWith(
      'download',
      expect.stringContaining('kept at'),
      expect.any(Error)
    );
  });

  it('drops an empty partial file when it cannot be moved', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '0' });
      res.end();
    });
    const dest = await scratch('empty');
    h.renameFail = true;
    h.copyFail = true;

    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath: dest, ...TRUST })
    ).rejects.toThrow(/copy failed/);
    await delay(50);

    expect(await partExists(dest)).toBe(false);
  });

  it('treats an unreadable partial size as empty when the move fails', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4' });
      res.end('data');
    });
    const dest = await scratch('stat-fail');
    h.renameFail = true;
    h.copyFail = true;
    h.statFail = true;

    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath: dest, ...TRUST })
    ).rejects.toThrow(/copy failed/);
    await delay(50);

    expect(await partExists(dest)).toBe(false);
  });

  it('logs a failure to remove a hopeless partial file', async () => {
    const origin = await startServer((_req, res) => {
      res.writeHead(404).end();
    });
    const dest = await scratch('rm-fail');
    h.rmFail = true;

    await expect(
      downloadHttpFile({ url: `${origin}/f`, destPath: dest, ...TRUST })
    ).rejects.toThrow(/HTTP 404/);
    await delay(50);

    expect(h.warn).toHaveBeenCalledWith(
      'download',
      expect.stringContaining('failed to remove partial file'),
      expect.any(Error)
    );
  });
});

describe('late abort between listener attach and request wait', () => {
  it('aborts when the signal flips during listener registration', async () => {
    const origin = await startServer(() => {
      // Celowo bez odpowiedzi.
    });
    const dir = await h.actual.mkdtemp(join(tmpdir(), 'onda-http-late-abort-'));
    tempDirs.push(dir);
    const rawSignal = {
      aborted: false,
      addEventListener: (_type: string, _cb: () => void) => {
        rawSignal.aborted = true;
      },
      removeEventListener: vi.fn()
    };
    const signal = rawSignal as unknown as AbortSignal;

    await expect(
      downloadHttpFile({
        url: `${origin}/hang`,
        destPath: join(dir, 'file.bin'),
        signal,
        ...TRUST
      })
    ).rejects.toThrow(/Aborted/);
  });
});

describe('abort during target resolution', () => {
  it('honours an abort that lands while DNS/target is resolved', async () => {
    const controller = new AbortController();
    h.onResolve = () => controller.abort();
    const dir = await h.actual.mkdtemp(join(tmpdir(), 'onda-http-abort-'));
    tempDirs.push(dir);
    const dest = join(dir, 'file.bin');

    await expect(
      downloadHttpFile({
        url: 'http://127.0.0.1:1/never',
        destPath: dest,
        signal: controller.signal,
        ...TRUST
      })
    ).rejects.toThrow(/Aborted/);
  });
});
