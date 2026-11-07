import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  jobs: new Map<string, any>(),
  queue: [] as string[],
  abort: new Map<string, AbortController>(),
  hold: { until: 0 },
  persist: vi.fn(),
  resolveBin: vi.fn(),
  getAuth: vi.fn(),
  cleanupAuth: vi.fn(),
  buildArgs: vi.fn(),
  runAttempt: vi.fn(),
  postProcess: vi.fn(),
  classify: vi.fn(() => 'network'),
  redact: vi.fn((v: string) => `redacted:${v}`),
  isWithin: vi.fn(() => true),
  untilStart: vi.fn(() => 0),
  readMax: vi.fn(),
  readNight: vi.fn(),
  readRetry: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
}));

vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.warn, info: state.info, error: vi.fn() }
}));
vi.mock('../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../youtube/youtube-auth', () => ({
  getYtAuthConfig: state.getAuth,
  cleanupYtAuthTemp: state.cleanupAuth
}));
vi.mock('../download-args', () => ({ buildBaseArgs: state.buildArgs }));
vi.mock('../download-attempt', () => ({ runJobAttempt: state.runAttempt }));
vi.mock('../download-post-process', () => ({ postProcess: state.postProcess }));
vi.mock('../error-classifier', () => ({
  classifyYtDlpError: state.classify,
  redactSecrets: state.redact
}));
vi.mock('../schedule', () => ({
  isWithinWindow: state.isWithin,
  msUntilWindowStart: state.untilStart
}));
vi.mock('../download-state', () => ({
  jobs: state.jobs,
  queueOrder: state.queue,
  hold: state.hold,
  persist: state.persist,
  jobAbortControllers: state.abort
}));
vi.mock('../download-settings', () => ({
  readMaxConcurrent: state.readMax,
  readNightSchedule: state.readNight,
  readRetryConfig: state.readRetry
}));

function job(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    url: 'https://x',
    title: id,
    status: 'pending',
    progress: 0,
    speed: '',
    eta: '',
    coverStatus: 'none',
    ...overrides
  } as any;
}

async function load() {
  vi.resetModules();
  return import('../download-runner');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 15; i += 1) await Promise.resolve();
}

async function start(jobOverrides: Record<string, unknown> = {}): Promise<any> {
  const target = job('job-1', jobOverrides);
  state.jobs.set('job-1', target);
  state.queue.push('job-1');
  const module = await load();
  await module.pump();
  await flush();
  return target;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00'));
  state.jobs.clear();
  state.queue.length = 0;
  state.abort.clear();
  state.hold.until = 0;
  state.persist.mockReset();
  state.resolveBin.mockReset();
  state.resolveBin.mockResolvedValue('/bin/yt-dlp');
  state.getAuth.mockReset();
  state.getAuth.mockResolvedValue({ cookies: 'auth' });
  state.cleanupAuth.mockReset();
  state.cleanupAuth.mockResolvedValue(undefined);
  state.buildArgs.mockReset();
  state.buildArgs.mockResolvedValue(['--arg']);
  state.runAttempt.mockReset();
  state.runAttempt.mockImplementation(async (target: any) => {
    target.status = 'completed';
    return { finishedOk: true };
  });
  state.postProcess.mockReset();
  state.postProcess.mockResolvedValue(undefined);
  state.classify.mockReset();
  state.classify.mockReturnValue('network');
  state.redact.mockReset();
  state.redact.mockImplementation((v: string) => `redacted:${v}`);
  state.isWithin.mockReset();
  state.isWithin.mockReturnValue(true);
  state.untilStart.mockReset();
  state.untilStart.mockReturnValue(0);
  state.readMax.mockReset();
  state.readMax.mockResolvedValue(2);
  state.readNight.mockReset();
  state.readNight.mockResolvedValue({ enabled: false, start: 0, end: 6 });
  state.readRetry.mockReset();
  state.readRetry.mockResolvedValue({ attempts: 1, baseMs: 100 });
  state.warn.mockReset();
  state.info.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pump', () => {
  it('respects the hold window', async () => {
    state.hold.until = Date.now() + 1000;
    const module = await load();
    state.jobs.set('a', job('a'));
    state.queue.push('a');

    await module.pump();
    expect(state.readNight).not.toHaveBeenCalled();
    expect(state.jobs.get('a').status).toBe('pending');
  });

  it('schedules a night pump and wakes up when the window opens', async () => {
    state.readNight.mockResolvedValue({ enabled: true, start: 22, end: 6 });
    state.isWithin.mockReturnValueOnce(false).mockReturnValue(true);
    state.untilStart.mockReturnValue(5000);
    state.jobs.set('a', job('a'));
    state.queue.push('a');

    const module = await load();
    await module.pump();
    expect(state.jobs.get('a').status).toBe('pending');

    await vi.advanceTimersByTimeAsync(5000);
    await flush();
    expect(state.runAttempt).toHaveBeenCalled();
  });

  it('does not schedule when the window is already open', async () => {
    state.readNight.mockResolvedValue({ enabled: true, start: 0, end: 23 });
    state.isWithin.mockReturnValue(true);
    const target = await start();
    expect(target.status).toBe('completed');
    expect(state.readMax).toHaveBeenCalled();
  });

  it('starts at most maxConcurrent jobs and skips missing or finished entries', async () => {
    let resolveAttempt!: (value: unknown) => void;
    state.runAttempt.mockReturnValue(new Promise((resolve) => (resolveAttempt = resolve)));
    state.readMax.mockResolvedValue(2);
    for (const id of ['a', 'b', 'c']) state.jobs.set(id, job(id));
    state.jobs.set('done', job('done', { status: 'completed' }));
    state.queue.push('missing', 'done', 'a', 'b', 'c');

    const module = await load();
    await module.pump();
    await flush();

    expect(state.jobs.get('a').status).toBe('downloading');
    expect(state.jobs.get('b').status).toBe('downloading');
    expect(state.jobs.get('c').status).toBe('pending');
    expect(state.queue).toEqual(['c']);
    resolveAttempt({ finishedOk: true });
  });
});

describe('runJob success', () => {
  it('runs an attempt, post-processes and cleans up', async () => {
    let controllerDuring: AbortController | undefined;
    state.runAttempt.mockImplementationOnce(async () => {
      controllerDuring = state.abort.get('job-1');
      return { finishedOk: true };
    });
    const target = await start();

    expect(state.resolveBin).toHaveBeenCalledWith('yt-dlp');
    expect(state.buildArgs).toHaveBeenCalledWith(target);
    expect(state.runAttempt).toHaveBeenCalledWith(target, '/bin/yt-dlp', { cookies: 'auth' }, [
      '--arg'
    ]);
    expect(controllerDuring).toBeInstanceOf(AbortController);
    expect(state.postProcess).toHaveBeenCalledWith(target);
    expect(state.abort.has('job-1')).toBe(false);
    expect(state.persist).toHaveBeenCalledWith(target);
    expect(state.cleanupAuth).toHaveBeenCalledWith({ cookies: 'auth' });
  });

  it('skips yt-dlp args for provider sources', async () => {
    await start({ source: { mode: 'provider' } });
    expect(state.buildArgs).not.toHaveBeenCalled();
    expect(state.runAttempt).toHaveBeenCalledWith(
      expect.anything(),
      '/bin/yt-dlp',
      { cookies: 'auth' },
      []
    );
  });

  it('falls back to the yt-dlp binary name', async () => {
    state.resolveBin.mockResolvedValue(null);
    await start();
    expect(state.runAttempt).toHaveBeenCalledWith(
      expect.anything(),
      'yt-dlp',
      expect.anything(),
      expect.anything()
    );
  });

  it('logs post-process failures without failing the download', async () => {
    state.postProcess.mockRejectedValueOnce(new Error('cover'));
    await start();
    expect(state.warn).toHaveBeenCalledWith(
      'downloads',
      'post-process failed for job-1',
      expect.any(Error)
    );
  });
});

describe('runJob errors and retries', () => {
  it('retries network errors with exponential backoff', async () => {
    state.readRetry.mockResolvedValue({ attempts: 2, baseMs: 100 });
    state.runAttempt
      .mockResolvedValueOnce({ finishedOk: false, errorCode: 'network' })
      .mockResolvedValueOnce({ finishedOk: true });
    const target = await start();

    expect(state.runAttempt).toHaveBeenCalledTimes(1);
    expect(target.status).toBe('downloading');
    expect(state.info).toHaveBeenCalledWith('downloads', expect.stringContaining('retrying job-1'));

    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(state.runAttempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-network or stopped jobs', async () => {
    state.readRetry.mockResolvedValue({ attempts: 3, baseMs: 10 });
    state.runAttempt.mockImplementationOnce(async (target: any) => {
      target.status = 'error';
      return { finishedOk: false, errorCode: 'bot-block' };
    });
    await start();
    expect(state.runAttempt).toHaveBeenCalledTimes(1);

    state.runAttempt.mockImplementationOnce(async (target: any) => {
      target.status = 'paused';
      return { finishedOk: false, errorCode: 'network' };
    });
    state.jobs.set('job-1', job('job-1'));
    state.queue.push('job-1');
    state.abort.clear();
    const module = await load();
    await module.pump();
    await flush();
    expect(state.runAttempt).toHaveBeenCalledTimes(2);
  });

  it('stops retrying when paused during backoff', async () => {
    state.readRetry.mockResolvedValue({ attempts: 2, baseMs: 100 });
    state.runAttempt.mockResolvedValue({ finishedOk: false, errorCode: 'network' });
    const target = await start();
    expect(state.runAttempt).toHaveBeenCalledTimes(1);

    target.status = 'paused';
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(state.runAttempt).toHaveBeenCalledTimes(1);
  });

  it('marks thrown failures with a redacted error code', async () => {
    state.resolveBin.mockRejectedValueOnce(new Error('secret token'));
    state.classify.mockReturnValueOnce('auth');
    const target = await start();

    expect(target.status).toBe('error');
    expect(target.error).toBe('redacted:secret token');
    expect(target.errorCode).toBe('auth');
    expect(state.warn).toHaveBeenCalledWith('downloads', 'job failed: secret token');
    expect(state.cleanupAuth).toHaveBeenCalledWith(null);
  });

  it('returns early when paused after resolving the binary or auth', async () => {
    state.resolveBin.mockImplementationOnce(async () => {
      state.jobs.get('job-1').status = 'paused';
      return '/bin/yt-dlp';
    });
    await start();
    expect(state.getAuth).not.toHaveBeenCalled();

    state.getAuth.mockImplementationOnce(async () => {
      state.jobs.get('job-1').status = 'cancelled';
      return { cookies: 'x' };
    });
    state.jobs.set('job-1', job('job-1'));
    state.queue.push('job-1');
    state.abort.clear();
    const module = await load();
    await module.pump();
    await flush();
    expect(state.runAttempt).not.toHaveBeenCalled();
    expect(state.cleanupAuth).toHaveBeenCalledWith({ cookies: 'x' });
  });

  it('returns early when aborted', async () => {
    state.buildArgs.mockImplementationOnce(async () => {
      const controller = state.abort.get('job-1');
      controller?.abort();
      return ['--arg'];
    });
    await start();
    expect(state.runAttempt).not.toHaveBeenCalled();
  });
});
