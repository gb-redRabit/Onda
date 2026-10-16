import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable, Readable } from 'node:stream';
import { join } from 'node:path';
import type { Job } from '../download-helpers';

// Testy behawioralne pojedynczej próby pobierania (runJobAttempt). Wszystkie
// zależności zewnętrzne (spawn, fs, http-downloader, providery, SoundCloud,
// generic-fetch, media-server, persystencja) są mockowane — testujemy logikę
// rozgałęzień i księgowość ukończenia, nie sam transfer.

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/onda-test' } }));

vi.mock('child_process', () => ({ spawn: vi.fn() }));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const { Writable } = await import('node:stream');
  return {
    ...actual,
    createWriteStream: () =>
      new Writable({
        write(_chunk, _enc, cb) {
          cb();
        }
      })
  };
});

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ mtimeMs: 0 }))
}));

vi.mock('../../../shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../media/media-server', () => ({ addAllowedRoot: vi.fn(async () => true) }));

vi.mock('../../ipc/generic-fetch', () => ({
  resolveSourceHeaders: vi.fn(async () => ({}))
}));

vi.mock('../../ipc/soundcloud/soundcloud-client', () => ({
  resolveScDownloadSource: vi.fn()
}));

vi.mock('../../ipc/providers/registry', () => ({
  resolveProviderFileUrl: vi.fn(),
  settleProviderDownload: vi.fn(async () => undefined)
}));

vi.mock('../http-downloader', () => ({ downloadHttpFile: vi.fn() }));

vi.mock('../download-state', () => ({
  persist: vi.fn(),
  persistThrottled: vi.fn(),
  reportCompleted: vi.fn(),
  jobAbortControllers: new Map()
}));

vi.mock('../output-path', () => ({
  resolveFinalOutputPath: vi.fn(async () => undefined),
  findNewestOutput: vi.fn(async () => null)
}));

import { spawn } from 'child_process';
import { downloadHttpFile } from '../http-downloader';
import { resolveProviderFileUrl, settleProviderDownload } from '../../ipc/providers/registry';
import { resolveScDownloadSource } from '../../ipc/soundcloud/soundcloud-client';
import { reportCompleted } from '../download-state';
import { runJobAttempt } from '../download-attempt';

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;
const httpMock = downloadHttpFile as unknown as ReturnType<typeof vi.fn>;
const providerUrlMock = resolveProviderFileUrl as unknown as ReturnType<typeof vi.fn>;
const settleMock = settleProviderDownload as unknown as ReturnType<typeof vi.fn>;
const scMock = resolveScDownloadSource as unknown as ReturnType<typeof vi.fn>;
const reportMock = reportCompleted as unknown as ReturnType<typeof vi.fn>;

function baseJob(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    url: 'https://example.com/x',
    title: 'T',
    kind: 'audio',
    format: 'mp3',
    quality: 'best',
    outputDir: '/tmp/onda-out',
    filenameTemplate: '{title}',
    progress: 0,
    speed: '',
    eta: '',
    status: 'downloading',
    startedAt: Date.now(),
    coverStatus: 'none',
    ...over
  } as Job;
}

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: () => void;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  return child;
}

beforeEach(() => {
  vi.clearAllMocks();
  httpMock.mockResolvedValue(undefined);
  settleMock.mockResolvedValue(undefined);
});

describe('runJobAttempt — http source', () => {
  it('marks the job completed and reports it', async () => {
    const job = baseJob({ source: { mode: 'http', fileName: 'x.mp3' } });
    httpMock.mockImplementation(async ({ onProgress }: { onProgress?: (p: unknown) => void }) => {
      onProgress?.({ received: 50, total: 100 });
      onProgress?.({ received: 100, total: 100 });
    });

    const res = await runJobAttempt(job, 'yt-dlp', null, []);

    expect(res.finishedOk).toBe(true);
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(reportMock).toHaveBeenCalledWith(job);
    expect(job.outputPath).toBe(join('/tmp/onda-out', 'x.mp3'));
  });

  it('classifies a failed http download as an error', async () => {
    const job = baseJob({ source: { mode: 'http', fileName: 'x.mp3' } });
    httpMock.mockRejectedValue(new Error('Private network address is not allowed'));

    const res = await runJobAttempt(job, 'yt-dlp', null, []);

    expect(res.finishedOk).toBe(false);
    expect(job.status).toBe('error');
    expect(job.error).toBeTruthy();
    expect(job.errorCode).toBeTruthy();
  });

  it('does not flip a paused job to error when the abort rejects the download', async () => {
    const job = baseJob({ source: { mode: 'http', fileName: 'x.mp3' } });
    httpMock.mockImplementation(async () => {
      job.status = 'paused';
      throw new Error('aborted');
    });

    await runJobAttempt(job, 'yt-dlp', null, []);

    expect(job.status).toBe('paused');
  });
});

describe('runJobAttempt — provider source', () => {
  const providerJob = () =>
    baseJob({
      source: {
        mode: 'provider',
        providerId: 'pikpak',
        providerRef: { provider: 'pikpak', shareId: 'S' },
        providerItemId: 'item1'
      }
    });

  it('rejects an incomplete provider source', async () => {
    const job = baseJob({ source: { mode: 'provider', providerId: 'pikpak' } });
    const res = await runJobAttempt(job, 'yt-dlp', null, []);
    expect(res.finishedOk).toBe(false);
    expect(job.status).toBe('error');
    expect(job.error).toBe('Invalid provider source');
  });

  it('streams a client-decrypted provider (MEGA) and settles the download', async () => {
    providerUrlMock.mockResolvedValue({ stream: Readable.from([Buffer.from('hello')]), size: 5 });
    const job = providerJob();

    const res = await runJobAttempt(job, 'yt-dlp', null, []);

    expect(res.finishedOk).toBe(true);
    expect(job.status).toBe('completed');
    expect(reportMock).toHaveBeenCalledWith(job);
    // MEGA (strumień) nie ma tymczasowej kopii do posprzątania — settle nie jest wołany.
    expect(settleMock).not.toHaveBeenCalled();
  });

  it('downloads a resolved provider URL through the http path', async () => {
    providerUrlMock.mockResolvedValue({ url: 'https://cdn/host', headers: { Referer: 'r' } });
    const job = providerJob();

    const res = await runJobAttempt(job, 'yt-dlp', null, []);

    expect(res.finishedOk).toBe(true);
    expect(httpMock).toHaveBeenCalled();
    expect(job.url).toBe('https://cdn/host');
    expect(settleMock).toHaveBeenCalled();
  });

  it('errors when the provider cannot resolve a link', async () => {
    providerUrlMock.mockRejectedValue(new Error('Bandwidth limit reached'));
    const job = providerJob();

    const res = await runJobAttempt(job, 'yt-dlp', null, []);

    expect(res.finishedOk).toBe(false);
    expect(job.status).toBe('error');
    expect(job.error).toBeTruthy();
  });
});

describe('runJobAttempt — soundcloud source', () => {
  const scJob = () => baseJob({ source: { mode: 'soundcloud', fileName: 'x.mp3' } });

  it('streams the resolved progressive mp3', async () => {
    scMock.mockResolvedValue('https://cf-media/audio.mp3');
    const job = scJob();

    const res = await runJobAttempt(job, 'yt-dlp', null, []);

    expect(res.finishedOk).toBe(true);
    expect(httpMock).toHaveBeenCalled();
    expect(job.url).toBe('https://cf-media/audio.mp3');
  });

  it('falls back to the yt-dlp pipeline when only HLS is available', async () => {
    scMock.mockRejectedValue(new Error('HLS only'));
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const job = scJob();

    const p = runJobAttempt(job, 'yt-dlp', null, ['-x']);
    // SoundCloud najpierw awaituje rozwiązanie źródła, więc spawn startuje dopiero
    // po ticku — poczekaj, aż proces powstanie, zanim wyemitujemy 'close'.
    await new Promise((r) => setTimeout(r, 0));
    child.emit('close', 0, null);
    const res = await p;

    expect(spawnMock).toHaveBeenCalled();
    expect(res.finishedOk).toBe(true);
    expect(job.status).toBe('completed');
  });
});

describe('runJobAttempt — yt-dlp process', () => {
  it('parses progress and completes on exit code 0', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const job = baseJob();

    const p = runJobAttempt(job, 'yt-dlp', null, ['-x']);
    child.stdout.emit('data', Buffer.from('[download]  50.0% of 10MiB at 1.00MiB/s ETA 00:05\n'));
    child.emit('close', 0, null);
    const res = await p;

    expect(res.finishedOk).toBe(true);
    expect(job.status).toBe('completed');
    expect(job.speed).toMatch(/\/s/);
    expect(reportMock).toHaveBeenCalledWith(job);
  });

  it('marks an error from a non-zero exit and the stderr text', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const job = baseJob();

    const p = runJobAttempt(job, 'yt-dlp', null, ['-x']);
    child.stderr.emit('data', Buffer.from('ERROR: Video unavailable\n'));
    child.emit('close', 1, null);
    const res = await p;

    expect(res.finishedOk).toBe(false);
    expect(job.status).toBe('error');
    expect(job.errorCode).toBeTruthy();
  });

  it('surfaces a spawn failure without overriding it with the close event', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const job = baseJob();

    const p = runJobAttempt(job, 'yt-dlp', null, ['-x']);
    child.emit('error', Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' }));
    child.emit('close', 1, null);
    const res = await p;

    expect(res.finishedOk).toBe(false);
    expect(job.status).toBe('error');
    expect(job.error).toMatch(/ENOENT|spawn/);
  });
});

void Writable;
