import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { Job } from '../download-helpers';

const h = vi.hoisted(() => ({
  spawn: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  buildYtArgs: vi.fn((base: string[], auth: unknown) => (auth ? [...base, '--auth'] : [...base])),
  kill: vi.fn(),
  persist: vi.fn(),
  persistThrottled: vi.fn(),
  reportCompleted: vi.fn(),
  classify: vi.fn(() => 'network' as const),
  describe: vi.fn(() => ''),
  redact: vi.fn((s: string) => s),
  warn: vi.fn(),
  parse: vi.fn()
}));

vi.mock('child_process', () => ({ spawn: h.spawn }));
vi.mock('fs/promises', () => ({ stat: h.stat, readdir: h.readdir }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../ipc/youtube/youtube-utils', () => ({ buildYtArgs: h.buildYtArgs }));
vi.mock('../kill-download-process', () => ({ killDownloadProcess: h.kill }));
vi.mock('../download-state', () => ({
  persist: h.persist,
  persistThrottled: h.persistThrottled,
  reportCompleted: h.reportCompleted
}));
vi.mock('../error-classifier', () => ({
  classifyYtDlpError: h.classify,
  describeError: h.describe,
  redactSecrets: h.redact
}));
vi.mock('../download-helpers', () => ({
  parseYtDlpProgress: h.parse,
  resolveOutputDir: () => '/out',
  outputExtensions: () => ['.mp3']
}));

import { runYtDlpAttempt } from '../download-attempt-ytdlp';

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
}

let child: FakeChild;

function fakeChild(): FakeChild {
  const instance = new EventEmitter() as FakeChild;
  instance.stdout = new EventEmitter();
  instance.stderr = new EventEmitter();
  instance.pid = 123;
  instance.killed = false;
  instance.kill = vi.fn();
  return instance;
}

function baseJob(over: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    url: 'https://example.com/x',
    title: 'Title',
    kind: 'audio',
    format: 'mp3',
    quality: 'best',
    outputDir: '/out',
    filenameTemplate: '{title}',
    progress: 0,
    speed: '',
    eta: '',
    status: 'downloading',
    startedAt: 1000,
    coverStatus: 'none',
    ...over
  } as Job;
}

const TIMEOUT_MS = 30 * 60 * 1000;

beforeEach(() => {
  child = fakeChild();
  h.spawn.mockReset().mockReturnValue(child);
  h.stat.mockReset().mockRejectedValue(new Error('ENOENT'));
  h.readdir.mockReset().mockRejectedValue(new Error('ENOENT'));
  h.persist.mockClear();
  h.persistThrottled.mockClear();
  h.reportCompleted.mockClear();
  h.kill.mockReset();
  h.classify.mockReset().mockReturnValue('network');
  h.describe.mockReset().mockReturnValue('');
  h.redact.mockReset().mockImplementation((s: string) => s);
  h.warn.mockClear();
  h.parse.mockReset().mockReturnValue(null);
  h.buildYtArgs.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('process setup', () => {
  it('spawns yt-dlp with the built arguments and job child', async () => {
    const promise = runYtDlpAttempt(baseJob(), '/bin/yt-dlp', null, ['-f', 'best']);

    expect(h.buildYtArgs).toHaveBeenCalledWith(['-f', 'best'], null);
    expect(h.spawn).toHaveBeenCalledWith(
      '/bin/yt-dlp',
      ['-f', 'best'],
      expect.objectContaining({
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: expect.objectContaining({ PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' })
      })
    );

    child.emit('close', 0, null);
    await promise;
  });

  it('passes auth to the argument builder', async () => {
    const promise = runYtDlpAttempt(baseJob(), 'yt-dlp', { token: 'x' } as never, []);

    expect(h.buildYtArgs).toHaveBeenCalledWith([], { token: 'x' });
    child.emit('close', 0, null);
    await promise;
  });
});

describe('progress parsing', () => {
  it('joins partial stdout lines before parsing', async () => {
    h.parse.mockImplementation((line: string) => {
      if (line.includes('Destination')) return { destination: '/out/song.mp3' };
      if (line.includes('[download]')) {
        return { progress: 42, speed: '1.2MiB/s', eta: '00:10' };
      }
      return null;
    });
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.stdout.emit('data', Buffer.from('[download] Destination: /out/so'));
    child.stdout.emit('data', Buffer.from('ng.mp3\n[download]  42% at 1.2MiB'));
    child.stdout.emit('data', Buffer.from('/s ETA 00:10\n'));

    expect(job.outputPath).toBe('/out/song.mp3');
    expect(job.progress).toBe(42);
    expect(job.speed).toBe('1.2MiB/s');
    expect(job.eta).toBe('00:10');
    expect(h.persistThrottled).toHaveBeenCalledTimes(2);

    child.emit('close', 0, null);
    await promise;
  });

  it('keeps the current speed and eta when a progress line omits them', async () => {
    h.parse.mockReturnValue({ progress: 60 });
    const job = baseJob({ speed: '1MiB/s', eta: '00:20' });
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.stdout.emit('data', Buffer.from('[download] 60%\n'));

    expect(job.progress).toBe(60);
    expect(job.speed).toBe('1MiB/s');
    expect(job.eta).toBe('00:20');

    child.emit('close', 0, null);
    await promise;
  });

  it('observes stderr without using it for progress', async () => {
    const promise = runYtDlpAttempt(baseJob(), 'yt-dlp', null, []);

    child.stderr.emit('data', Buffer.from('warning line\n'));

    expect(h.parse).toHaveBeenCalledWith('warning line');
    child.emit('close', 0, null);
    await promise;
  });
});

describe('successful completion', () => {
  it('marks the job complete and resolves the parsed destination', async () => {
    h.stat.mockResolvedValue({ isFile: () => true });
    h.parse.mockImplementation((line: string) =>
      line.includes('Destination') ? { destination: '/out/final.mp3' } : null
    );
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.stdout.emit('data', Buffer.from('[download] Destination: /out/song.mp3\n'));
    child.emit('close', 0, null);
    const result = await promise;

    expect(result).toEqual({ finishedOk: true, errorCode: undefined });
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(job.completedAt).toEqual(expect.any(Number));
    expect(job.outputPath).toBe('/out/final.mp3');
    expect(h.reportCompleted).toHaveBeenCalledWith(job);
  });

  it('falls back to the newest matching file when destinations are unusable', async () => {
    h.readdir.mockResolvedValue([{ name: 'old.mp3' }, { name: 'new.mp3' }, { name: 'notes.txt' }]);
    h.stat.mockImplementation(async (p: string) => {
      if (p === join('/out', 'old.mp3')) return { mtimeMs: 10, isFile: () => true };
      if (p === join('/out', 'new.mp3')) return { mtimeMs: 20, isFile: () => true };
      throw new Error('ENOENT');
    });
    const job = baseJob({ startedAt: 5 });
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.emit('close', 0, null);
    await promise;

    expect(job.outputPath).toBe(join('/out', 'new.mp3'));
    expect(h.persist).toHaveBeenCalledWith(job);
  });

  it('skips persistence when the resolved path does not change', async () => {
    h.stat.mockResolvedValue({ isFile: () => true });
    h.parse.mockImplementation((line: string) =>
      line.includes('Destination') ? { destination: '/out/song.mp3' } : null
    );
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.stdout.emit('data', Buffer.from('[download] Destination: /out/song.mp3\n'));
    child.emit('close', 0, null);
    await promise;

    expect(job.outputPath).toBe('/out/song.mp3');
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.reportCompleted).toHaveBeenCalledWith(job);
  });

  it('keeps the parsed path when no fallback file matches', async () => {
    h.parse.mockImplementation((line: string) =>
      line.includes('Destination') ? { destination: '/out/song.mp3' } : null
    );
    h.readdir.mockResolvedValue([{ name: 'notes.txt' }]);
    h.stat.mockImplementation(async (p: string) => {
      if (p === join('/out', 'notes.txt')) return { mtimeMs: 20, isFile: () => true };
      throw new Error('ENOENT');
    });
    const job = baseJob({ startedAt: 5 });
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.stdout.emit('data', Buffer.from('[download] Destination: /out/song.mp3\n'));
    child.emit('close', 0, null);
    await promise;

    expect(job.outputPath).toBe('/out/song.mp3');
    expect(h.persist).not.toHaveBeenCalled();
  });

  it('logs directory scan failures without failing the download', async () => {
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.emit('close', 0, null);
    await promise;

    expect(h.warn).toHaveBeenCalledWith(
      'downloads',
      'locating output file failed for job-1',
      expect.any(Error)
    );
    expect(job.status).toBe('completed');
  });

  it('ignores empty destination entries', async () => {
    h.parse.mockReturnValue({ destination: '' });
    const promise = runYtDlpAttempt(baseJob(), 'yt-dlp', null, []);

    child.stdout.emit('data', Buffer.from('[download] Destination: \n'));
    child.emit('close', 0, null);
    await promise;

    expect(h.stat).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it('settles the attempt when spawning fails', async () => {
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);
    h.classify.mockReturnValue('binary-missing' as never);

    child.emit('error', new Error('ENOENT: yt-dlp'));

    await expect(promise).resolves.toEqual({ finishedOk: false, errorCode: 'binary-missing' });
    expect(job.status).toBe('error');
    expect(job.error).toBe('ENOENT: yt-dlp');
    expect(h.persist).toHaveBeenCalledWith(job);
  });

  it('redacts secrets from spawn errors', async () => {
    const promise = runYtDlpAttempt(baseJob(), 'yt-dlp', null, []);
    h.redact.mockReturnValue('[redacted]');

    child.emit('error', new Error('https://user:pass@example.com/x'));
    await promise;

    expect(h.redact).toHaveBeenCalledWith('https://user:pass@example.com/x');
    expect(h.persist).toHaveBeenCalledWith(expect.objectContaining({ error: '[redacted]' }));
  });

  it('does not let a later close overwrite a spawn error', async () => {
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.emit('error', new Error('ENOENT'));
    child.emit('close', 1, null);
    await promise;

    expect(job.error).toBe('ENOENT');
    expect(job.errorCode).toBe('network');
  });

  it('classifies a non-zero exit from stderr', async () => {
    const job = baseJob({ coverStatus: 'fetching' });
    h.classify.mockReturnValue('disk-full' as never);
    h.describe.mockReturnValue('Disk is full');
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.stderr.emit('data', Buffer.from('ERROR: no space left on device\n'));
    child.emit('close', 1, null);
    const result = await promise;

    expect(result).toEqual({ finishedOk: false, errorCode: 'disk-full' });
    expect(job.status).toBe('error');
    expect(job.errorCode).toBe('disk-full');
    expect(job.error).toBe('ERROR: no space left on device');
    expect(job.coverStatus).toBe('error');
    expect(h.classify).toHaveBeenCalledWith('ERROR: no space left on device\n');
  });

  it('uses the described error when stderr is empty', async () => {
    h.classify.mockReturnValue('network');
    h.describe.mockReturnValue('Network problem');
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.emit('close', 7, null);
    await promise;

    expect(job.error).toBe('Network problem');
  });

  it('falls back to the exit code when nothing describes the failure', async () => {
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.emit('close', 7, null);
    await promise;

    expect(job.error).toBe('yt-dlp exited with code 7');
  });

  it('marks a signalled process as cancelled', async () => {
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.emit('close', null, 'SIGTERM');
    await promise;

    expect(job.status).toBe('cancelled');
    expect(job.error).toBeUndefined();
  });

  it.each(['cancelled', 'paused'] as const)('leaves a %s job untouched', async (status) => {
    const job = baseJob({ status });
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    child.emit('close', 1, null);
    await promise;

    expect(job.status).toBe(status);
    expect(job.error).toBeUndefined();
    expect(h.reportCompleted).not.toHaveBeenCalled();
  });
});

describe('timeout', () => {
  it('fails the job and kills the process after thirty minutes', async () => {
    vi.useFakeTimers();
    const job = baseJob();
    const promise = runYtDlpAttempt(job, 'yt-dlp', null, []);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(job.status).toBe('error');
    expect(job.error).toBe('Download timed out');
    expect(job.errorCode).toBe('network');
    expect(h.persist).toHaveBeenCalledWith(job);
    expect(h.kill).toHaveBeenCalledWith(child);

    child.emit('close', null, 'SIGTERM');
    const result = await promise;
    expect(result).toEqual({ finishedOk: false, errorCode: 'network' });
    expect(job.status).toBe('error');
  });

  it('settles immediately when the kill helper throws', async () => {
    vi.useFakeTimers();
    h.kill.mockImplementation(() => {
      throw new Error('no process');
    });
    const promise = runYtDlpAttempt(baseJob(), 'yt-dlp', null, []);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    await expect(promise).resolves.toEqual({ finishedOk: false, errorCode: 'network' });
  });
});
