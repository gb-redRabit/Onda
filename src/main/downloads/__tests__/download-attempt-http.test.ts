import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job } from '../download-helpers';

const h = vi.hoisted(() => ({
  dir: '',
  downloadHttpFile: vi.fn(),
  resolveSourceHeaders: vi.fn(),
  persist: vi.fn(),
  persistThrottled: vi.fn(),
  reportCompleted: vi.fn(),
  addAllowedRoot: vi.fn()
}));

vi.mock('../http-downloader', () => ({ downloadHttpFile: h.downloadHttpFile }));
vi.mock('../download-helpers', () => ({
  resolveOutputDir: () => h.dir,
  deriveHttpFileName: () => 'derived.mp4',
  formatBytes: (n: number) => `${Math.round(n)}B`,
  formatEta: (s: number) => `eta:${Math.round(s)}`
}));
vi.mock('../download-source', () => ({
  safeDownloadFileName: (raw: unknown) =>
    typeof raw === 'string' && raw ? raw.split(/[\\/]/).pop()! : ''
}));
vi.mock('../../ipc/generic-fetch', () => ({ resolveSourceHeaders: h.resolveSourceHeaders }));
vi.mock('../error-classifier', () => ({
  classifyYtDlpError: () => 'http-error',
  redactSecrets: (s: string) => s.replace(/secret/g, '***')
}));
vi.mock('../../media/media-server', () => ({ addAllowedRoot: h.addAllowedRoot }));
vi.mock('../download-state', () => ({
  persist: h.persist,
  persistThrottled: h.persistThrottled,
  reportCompleted: h.reportCompleted
}));

import { runHttpAttempt, runStreamAttempt } from '../download-attempt-http';

interface HttpOptions {
  url: string;
  destPath: string;
  headers: Record<string, string>;
  allowPrivateNetwork?: boolean;
  signal?: AbortSignal;
  onProgress: (p: { received: number; total?: number }) => void;
}

function makeJob(over: Record<string, unknown> = {}): Job {
  return {
    id: 'job-1',
    url: 'https://cdn.example/a.mp4',
    status: 'downloading',
    progress: 0,
    source: {
      fileName: 'a.mp4',
      headerName: 'X-Key',
      apiKeyId: 'key-1',
      headers: { 'X-Source': 'yes' },
      allowPrivateNetwork: true
    },
    ...over
  } as unknown as Job;
}

function tick(ms = 25): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  h.dir = mkdtempSync(join(tmpdir(), 'onda-http-attempt-'));
  h.downloadHttpFile.mockReset().mockResolvedValue(undefined);
  h.resolveSourceHeaders.mockReset().mockResolvedValue({ Authorization: 'Bearer k' });
  h.persist.mockClear();
  h.persistThrottled.mockClear();
  h.reportCompleted.mockClear();
  h.addAllowedRoot.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  rmSync(h.dir, { recursive: true, force: true });
});

describe('runHttpAttempt', () => {
  it('streams the file, reports progress and marks the job completed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const job = makeJob();
    let options!: HttpOptions;
    h.downloadHttpFile.mockImplementation(async (o: HttpOptions) => {
      options = o;
      o.onProgress({ received: 500, total: 1000 });
      vi.setSystemTime(1000);
      job.status = 'paused';
      o.onProgress({ received: 100, total: 1000 });
      job.status = 'downloading';
      o.onProgress({ received: 500, total: 1000 });
      o.onProgress({ received: 400, total: 0 });
    });

    const result = await runHttpAttempt(job);

    expect(result).toEqual({ finishedOk: true });
    expect(job.outputPath).toBe(join(h.dir, 'a.mp4'));
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(job.completedAt).toBe(1000);
    expect(options.headers).toEqual({ Authorization: 'Bearer k', 'X-Source': 'yes' });
    expect(options.allowPrivateNetwork).toBe(true);
    expect(h.addAllowedRoot).toHaveBeenCalledWith(h.dir);
    expect(h.persist).toHaveBeenCalledTimes(2);
    expect(h.persistThrottled).toHaveBeenCalledTimes(3);
    expect(h.reportCompleted).toHaveBeenCalledWith(job);
  });

  it('falls back to a derived filename and empty headers', async () => {
    const job = makeJob({
      source: { allowPrivateNetwork: false }
    });
    h.resolveSourceHeaders.mockResolvedValueOnce({});
    let options!: HttpOptions;
    h.downloadHttpFile.mockImplementationOnce(async (o: HttpOptions) => {
      options = o;
    });

    await runHttpAttempt(job);

    expect(job.outputPath).toBe(join(h.dir, 'derived.mp4'));
    expect(options.headers).toEqual({});
    expect(h.resolveSourceHeaders).toHaveBeenCalledWith(undefined, undefined);
  });

  it('records a classified error and redacts secrets', async () => {
    const job = makeJob();
    h.downloadHttpFile.mockRejectedValueOnce(new Error('upstream secret rejected'));

    const result = await runHttpAttempt(job);

    expect(result).toEqual({ finishedOk: false, errorCode: 'http-error' });
    expect(job.status).toBe('error');
    expect(job.error).toBe('upstream *** rejected');
    expect(job.errorCode).toBe('http-error');
    expect(h.persist).toHaveBeenCalledTimes(2);
  });

  it('stringifies non-Error failures', async () => {
    const job = makeJob();
    h.downloadHttpFile.mockRejectedValueOnce('raw outage');

    const result = await runHttpAttempt(job);

    expect(result).toEqual({ finishedOk: false, errorCode: 'http-error' });
    expect(job.error).toBe('raw outage');
  });

  it('does not overwrite the status of a paused or cancelled job', async () => {
    const job = makeJob({ status: 'paused' });
    h.downloadHttpFile.mockRejectedValueOnce(new Error('aborted'));

    const result = await runHttpAttempt(job);

    expect(job.status).toBe('paused');
    expect(job.error).toBeUndefined();
    expect(result).toEqual({ finishedOk: false, errorCode: undefined });
  });
});

describe('runStreamAttempt', () => {
  it('writes the stream and reports progress against the total size', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const job = makeJob({ source: { fileName: 'stream.mp4' } });
    const stream = new PassThrough();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');

    const promise = runStreamAttempt(job, stream, 10, controller.signal);
    await tick();
    now.mockReturnValue(1000);
    stream.write(Buffer.from('abcde'));
    await tick();
    stream.end(Buffer.from('fghij'));
    const result = await promise;

    expect(result).toEqual({ finishedOk: true });
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(job.speed).toBe('10B/s');
    expect(job.eta).toBe('eta:0');
    expect(readFileSync(job.outputPath!, 'utf-8')).toBe('abcdefghij');
    expect(removeListener).toHaveBeenCalled();
    expect(h.reportCompleted).toHaveBeenCalledWith(job);
  });

  it('skips progress updates when the job is not downloading', async () => {
    const job = makeJob({ source: { fileName: 'paused.mp4' }, status: 'paused' });
    const stream = new PassThrough();

    const promise = runStreamAttempt(job, stream);
    await tick();
    stream.end(Buffer.from('data'));
    const result = await promise;

    expect(result).toEqual({ finishedOk: true });
    expect(job.progress).toBe(100);
    expect(h.persistThrottled).not.toHaveBeenCalled();
    expect(readFileSync(job.outputPath!, 'utf-8')).toBe('data');
  });

  it('derives the stream filename when none is provided', async () => {
    const job = makeJob({ source: {} });
    const stream = new PassThrough();

    const promise = runStreamAttempt(job, stream);
    await tick();
    stream.end(Buffer.from('x'));
    await promise;

    expect(job.outputPath).toBe(join(h.dir, 'derived.mp4'));
  });

  it('reports speed without eta when the total size is unknown', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const job = makeJob({ source: { fileName: 'unknown.mp4' } });
    const stream = new PassThrough();

    const promise = runStreamAttempt(job, stream);
    await tick();
    now.mockReturnValue(1000);
    stream.write(Buffer.from('abc'));
    stream.end();
    await promise;

    expect(job.speed).toBe('3B/s');
    expect(job.eta).toBeUndefined();
  });

  it('records a stream failure as an error', async () => {
    const job = makeJob({ source: { fileName: 'broken.mp4' } });
    const stream = new PassThrough();

    const promise = runStreamAttempt(job, stream);
    await tick();
    stream.destroy(new Error('stream secret failed'));

    await expect(promise).resolves.toEqual({ finishedOk: false, errorCode: 'http-error' });
    expect(job.status).toBe('error');
    expect(job.error).toBe('stream *** failed');
  });

  it('stringifies non-Error stream failures', async () => {
    const job = makeJob({ source: { fileName: 'weird.mp4' } });
    const stream = new PassThrough();

    const promise = runStreamAttempt(job, stream);
    await tick();
    stream.emit('error', 'oops');

    await expect(promise).resolves.toEqual({ finishedOk: false, errorCode: 'http-error' });
    expect(job.error).toBe('oops');
  });

  it('keeps a paused status when the stream fails', async () => {
    const job = makeJob({ source: { fileName: 'paused.mp4' }, status: 'paused' });
    const stream = new PassThrough();

    const promise = runStreamAttempt(job, stream);
    await tick();
    stream.destroy(new Error('aborted'));

    await expect(promise).resolves.toEqual({ finishedOk: false, errorCode: undefined });
    expect(job.status).toBe('paused');
    expect(job.error).toBeUndefined();
  });

  it('destroys the stream when the signal aborts', async () => {
    const job = makeJob({ source: { fileName: 'cancelled.mp4' }, status: 'cancelled' });
    const stream = new PassThrough();
    const controller = new AbortController();

    const promise = runStreamAttempt(job, stream, undefined, controller.signal);
    await tick();
    controller.abort();

    await expect(promise).resolves.toEqual({ finishedOk: false, errorCode: undefined });
    expect(stream.destroyed).toBe(true);
    expect(job.status).toBe('cancelled');
  });

  it('tolerates a stream that is already closed on abort', async () => {
    const job = makeJob({ source: { fileName: 'closed.mp4' } });
    const stream = new PassThrough();
    const controller = new AbortController();
    const originalDestroy = stream.destroy.bind(stream);

    const promise = runStreamAttempt(job, stream, undefined, controller.signal);
    await tick();
    stream.destroy = () => {
      throw new Error('already closed');
    };
    controller.abort();
    stream.destroy = originalDestroy;
    stream.end(Buffer.from('ok'));

    await expect(promise).resolves.toEqual({ finishedOk: true });
    expect(readFileSync(job.outputPath!, 'utf-8')).toBe('ok');
  });
});
