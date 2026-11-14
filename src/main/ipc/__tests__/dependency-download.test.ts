import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Transport HTTP jest podstawiony; zapis plików, rename i hashowanie działają
// naprawdę, więc test obejmuje też atomowość pobrania i weryfikację sum.
const state = vi.hoisted(() => ({
  binDir: '',
  get: null as null | ((url: string, options: unknown, callback: (res: unknown) => void) => unknown)
}));

// Channel can be flipped to exercise both release repositories.
const channel = vi.hoisted(() => ({ value: 'nightly' }));

vi.mock('https', () => ({
  default: {
    get: (url: string, options: unknown, callback: (res: unknown) => void) =>
      state.get!(url, options, callback)
  }
}));
vi.mock('../../binaries', () => ({ getBinDir: () => state.binDir }));
vi.mock('../dependency/dependency-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dependency/dependency-utils')>();
  return {
    ...actual,
    get YTDLP_CHANNEL() {
      return channel.value;
    }
  };
});

const {
  emitProgress,
  newSignal,
  clearSignal,
  abortTool,
  downloadFile,
  fetchLatestYtdlpVersion,
  verifyFileSha256,
  verifyDownloadedFile
} = await import('../dependency/dependency-download');

const root = mkdtempSync(join(tmpdir(), 'onda-dep-download-'));

beforeEach(() => {
  state.binDir = mkdtempSync(join(root, 'bin-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

interface FakeInit {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  chunks?: unknown[];
  hold?: boolean;
  error?: Error;
}

function fakeResponse(init: FakeInit): Readable {
  if (init.hold) {
    const stream = new PassThrough();
    Object.assign(stream, {
      statusCode: init.statusCode ?? 200,
      headers: init.headers ?? {}
    });
    return stream;
  }
  const body = init.chunks ?? (init.body === undefined ? [] : [Buffer.from(init.body)]);
  const stream = Readable.from(body);
  Object.assign(stream, {
    statusCode: init.statusCode ?? 200,
    headers: init.headers ?? {}
  });
  if (init.error) process.nextTick(() => stream.emit('error', init.error));
  return stream;
}

function mockTransport(sequence: FakeInit[]): {
  calls: Array<{ url: string }>;
  requests: any[];
  responses: Readable[];
} {
  const calls: Array<{ url: string }> = [];
  const requests: any[] = [];
  const responses: Readable[] = [];
  state.get = (url, _options, callback) => {
    calls.push({ url });
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
    req.destroy = vi.fn((err?: Error) => {
      if (err) req.emit('error', err);
    });
    req.timeoutHandler = null;
    req.setTimeout = vi.fn((_ms: number, cb: () => void) => {
      req.timeoutHandler = cb;
    });
    requests.push(req);
    const next = sequence.shift() ?? {};
    process.nextTick(() => {
      const res = fakeResponse(next);
      responses.push(res);
      callback(res);
    });
    return req;
  };
  return { calls, requests, responses };
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('downloadFile', () => {
  it('rejects invalid and non-HTTPS URLs without opening a connection', async () => {
    const { calls } = mockTransport([]);
    const signal = new AbortController().signal;

    await expect(downloadFile('not a url', join(root, 'x'), signal)).rejects.toThrow('invalid URL');
    await expect(downloadFile('http://example.com/x', join(root, 'x'), signal)).rejects.toThrow(
      'only HTTPS downloads are allowed'
    );
    expect(calls).toHaveLength(0);
  });

  it('rejects an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadFile('https://example.com/x', join(root, 'x'), controller.signal)
    ).rejects.toThrow('cancelled');
  });

  it('downloads to a temporary file, reports progress and renames it atomically', async () => {
    mockTransport([{ body: 'hello', headers: { 'content-length': '5' } }]);
    const dest = join(root, 'downloaded.bin');
    const progress: Array<[number, number]> = [];

    await downloadFile('https://example.com/x', dest, new AbortController().signal, (r, t) =>
      progress.push([r, t])
    );

    expect(readFileSync(dest, 'utf8')).toBe('hello');
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(progress).toEqual([[5, 5]]);
  });

  it('follows an HTTPS redirect and resolves a relative location', async () => {
    const { calls } = mockTransport([
      { statusCode: 302, headers: { location: '/final.bin' } },
      { body: 'redirected' }
    ]);
    const dest = join(root, 'redirect.bin');

    await downloadFile('https://example.com/start', dest, new AbortController().signal);

    expect(readFileSync(dest, 'utf8')).toBe('redirected');
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.com/start',
      'https://example.com/final.bin'
    ]);
  });

  it('stops after too many redirects', async () => {
    const redirects = Array.from({ length: 6 }, (_, i) => ({
      statusCode: 302,
      headers: { location: `/r${i}` }
    }));
    const { calls } = mockTransport(redirects);

    await expect(
      downloadFile('https://example.com/r', join(root, 'loop.bin'), new AbortController().signal)
    ).rejects.toThrow('too many redirects');
    // Start + 5 dozwolonych przekierowań; szóste przekroczenie limitu.
    expect(calls).toHaveLength(6);
  });

  it('rejects a non-200 response', async () => {
    mockTransport([{ statusCode: 404, body: 'nope' }]);
    await expect(
      downloadFile('https://example.com/x', join(root, 'missing.bin'), new AbortController().signal)
    ).rejects.toThrow('HTTP 404');
    expect(existsSync(join(root, 'missing.bin'))).toBe(false);
  });

  it('rejects a declared size above the limit before writing', async () => {
    mockTransport([{ headers: { 'content-length': String(513 * 1024 * 1024) } }]);
    await expect(
      downloadFile('https://example.com/huge', join(root, 'huge.bin'), new AbortController().signal)
    ).rejects.toThrow('download exceeds size limit');
  });

  it('cancels an in-flight download when the signal aborts', async () => {
    const { requests } = mockTransport([{ hold: true }]);
    const controller = new AbortController();
    const dest = join(root, 'abort.bin');
    const pending = downloadFile('https://example.com/x', dest, controller.signal);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toHaveLength(1);
    controller.abort();

    await expect(pending).rejects.toThrow('cancelled');
  });

  it('aborts when the streamed body exceeds the byte budget', async () => {
    mockTransport([{ body: 'abcdef' }]);

    await expect(
      downloadFile(
        'https://example.com/x',
        join(root, 'budget.bin'),
        new AbortController().signal,
        undefined,
        3
      )
    ).rejects.toThrow('download exceeds size limit');
  });

  it('fails on a response stream error and ignores a later request error', async () => {
    const { requests, responses } = mockTransport([{ hold: true }]);
    const dest = join(root, 'stream-error.bin');
    const pending = downloadFile('https://example.com/x', dest, new AbortController().signal);

    await new Promise((resolve) => setTimeout(resolve, 0));
    responses[0]!.emit('error', new Error('stream broke'));

    await expect(pending).rejects.toThrow('stream broke');
    requests[0]!.emit('error', new Error('late'));
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it('fails when the temporary file cannot be written', async () => {
    const dest = join(root, 'blocked.bin');
    mkdirSync(`${dest}.part`, { recursive: true });
    mockTransport([{ body: 'x' }]);

    await expect(
      downloadFile('https://example.com/x', dest, new AbortController().signal)
    ).rejects.toThrow();
  });

  it('rejects when the final rename fails', async () => {
    const dest = join(root, 'rename-target');
    mkdirSync(dest);
    mockTransport([{ body: 'x' }]);

    await expect(
      downloadFile('https://example.com/x', dest, new AbortController().signal)
    ).rejects.toThrow();
  });

  it('times out a stalled request', async () => {
    vi.useFakeTimers();
    try {
      mockTransport([{ hold: true }]);
      const pending = downloadFile(
        'https://example.com/x',
        join(root, 'timeout.bin'),
        new AbortController().signal
      );
      const expectation = expect(pending).rejects.toThrow('download timed out');

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchLatestYtdlpVersion', () => {
  it('strips a leading v from the latest tag', async () => {
    mockTransport([{ body: JSON.stringify({ tag_name: 'v2026.08.18' }) }]);
    expect(await fetchLatestYtdlpVersion()).toBe('2026.08.18');
  });

  it('returns null for a missing tag or invalid JSON', async () => {
    mockTransport([{ body: JSON.stringify({}) }]);
    expect(await fetchLatestYtdlpVersion()).toBeNull();

    mockTransport([{ body: 'not json' }]);
    expect(await fetchLatestYtdlpVersion()).toBeNull();
  });

  it('returns null when the request fails or times out', async () => {
    const first = mockTransport([{ hold: true }]);
    const pendingError = fetchLatestYtdlpVersion();
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.requests[0]!.emit('error', new Error('offline'));
    await expect(pendingError).resolves.toBeNull();

    const second = mockTransport([{ hold: true }]);
    const pendingTimeout = fetchLatestYtdlpVersion();
    await new Promise((resolve) => setTimeout(resolve, 0));
    second.requests[0]!.timeoutHandler();
    await expect(pendingTimeout).resolves.toBeNull();
  });
});

describe('signals and progress', () => {
  it('aborts the previous signal for the same tool', () => {
    const first = newSignal('ffmpeg');
    const second = newSignal('ffmpeg');
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    clearSignal('ffmpeg');
  });

  it('abortTool cancels only the requested tool', () => {
    const ffmpeg = newSignal('ffmpeg');
    const ytdlp = newSignal('yt-dlp');
    abortTool('ffmpeg');
    expect(ffmpeg.aborted).toBe(true);
    expect(ytdlp.aborted).toBe(false);
    clearSignal('ffmpeg');
    clearSignal('yt-dlp');
  });

  it('skips destroyed senders and forwards progress otherwise', () => {
    const destroyed = { isDestroyed: () => true, send: vi.fn() };
    const live = { isDestroyed: () => false, send: vi.fn() };

    emitProgress(destroyed as never, 'ffmpeg', 'download', 10);
    emitProgress(live as never, 'ffmpeg', 'download', 10);

    expect(destroyed.send).not.toHaveBeenCalled();
    expect(live.send).toHaveBeenCalledWith('dep:progress', {
      tool: 'ffmpeg',
      stage: 'download',
      percent: 10
    });
  });
});

describe('checksum verification', () => {
  it('accepts a matching hash case-insensitively', async () => {
    const file = join(state.binDir, 'bin');
    writeFileSync(file, 'payload');
    await expect(
      verifyFileSha256(file, sha256('payload').toUpperCase(), new AbortController().signal)
    ).resolves.toBeUndefined();
  });

  it('rejects a mismatched hash and an aborted signal', async () => {
    const file = join(state.binDir, 'bin2');
    writeFileSync(file, 'payload');
    await expect(
      verifyFileSha256(file, sha256('other'), new AbortController().signal)
    ).rejects.toThrow('Checksum mismatch');

    const controller = new AbortController();
    controller.abort();
    await expect(verifyFileSha256(file, sha256('payload'), controller.signal)).rejects.toThrow(
      'cancelled'
    );
  });

  it('verifies an asset against the downloaded manifest and cleans up', async () => {
    const content = 'downloaded-binary';
    const file = join(state.binDir, 'asset');
    writeFileSync(file, content);
    mockTransport([{ body: `${'0'.repeat(64)}  other-asset\n${sha256(content)} *asset\n` }]);

    await verifyDownloadedFile(
      file,
      'https://example.com/SHA2-256SUMS',
      'asset',
      new AbortController().signal
    );

    expect(readdirSync(state.binDir)).toEqual(['asset']);
  });

  it('rejects a missing manifest entry and removes the manifest file', async () => {
    const file = join(state.binDir, 'asset2');
    writeFileSync(file, 'payload');
    mockTransport([{ body: `${sha256('payload')}  different-name\n` }]);

    await expect(
      verifyDownloadedFile(
        file,
        'https://example.com/SHA2-256SUMS',
        'asset2',
        new AbortController().signal
      )
    ).rejects.toThrow('Checksum mismatch');
    expect(readdirSync(state.binDir)).toEqual(['asset2']);
  });
});

describe('release channel', () => {
  it('checks the stable repository when the channel is not nightly', async () => {
    channel.value = 'stable';
    try {
      vi.resetModules();
      const mod = await import('../dependency/dependency-download');
      const { calls } = mockTransport([{ body: JSON.stringify({ tag_name: 'v1.2.3' }) }]);

      await expect(mod.fetchLatestYtdlpVersion()).resolves.toBe('1.2.3');
      expect(calls[0]?.url).toContain('repos/yt-dlp/yt-dlp/releases/latest');
    } finally {
      channel.value = 'nightly';
    }
  });
});
