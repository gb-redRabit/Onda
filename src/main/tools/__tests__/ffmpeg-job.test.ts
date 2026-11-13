import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
const resolveBinMock = vi.hoisted(() =>
  vi.fn(async (): Promise<string | null> => '/resolved/ffmpeg')
);
const rmMock = vi.hoisted(() => ({
  fn: vi.fn(),
  real: null as unknown as (...args: unknown[]) => Promise<void>
}));

vi.mock('child_process', () => ({ spawn: spawnMock }));
vi.mock('../../binaries', () => ({ resolveBin: resolveBinMock }));
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  rmMock.real = actual.rm as unknown as (...args: unknown[]) => Promise<void>;
  return { ...actual, rm: (...args: unknown[]) => rmMock.fn(...args) };
});

const { MAX_FFMPEG_JOB_MS, cancelAllFfmpegJobs, cancelFfmpegJob, runFfmpegJob } =
  await import('../ffmpeg-job');

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

function makeSender() {
  return { isDestroyed: () => false, send: vi.fn() };
}

let dir = '';
let output = '';

beforeEach(() => {
  vi.useFakeTimers();
  spawnMock.mockReset();
  resolveBinMock.mockReset().mockResolvedValue('/resolved/ffmpeg');
  rmMock.fn.mockReset().mockImplementation((...args: unknown[]) => rmMock.real(...args));
  dir = mkdtempSync(join(tmpdir(), 'onda-ffmpeg-job-'));
  output = join(dir, 'out.mp3');
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

function start(jobId: string, sender: ReturnType<typeof makeSender>) {
  const child = new FakeChild();
  spawnMock.mockReturnValue(child);
  const promise = runFfmpegJob({
    jobId,
    args: ['-i', 'in.wav', 'out.mp3'],
    outputPath: output,
    durationSec: 2,
    sender: sender as never,
    timeoutMessage: 'Conversion timed out',
    label: 'conversion',
    ffmpeg: 'ffmpeg'
  });
  return { child, promise };
}

describe('shared FFmpeg job runner', () => {
  it('reports progress and resolves when FFmpeg writes the output', async () => {
    const sender = makeSender();
    const { child, promise } = start('success', sender);
    writeFileSync(output, 'ok');

    child.stdout.emit('data', Buffer.from('out_time_us=500000\nspeed=2x\n'));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({ success: true, outputPath: output });
    expect(sender.send).toHaveBeenCalledWith(
      'tools:progress',
      expect.objectContaining({ jobId: 'success', percent: 25 })
    );
  });

  it('cancels a running job and removes a partial output', async () => {
    const sender = makeSender();
    const { child, promise } = start('cancel', sender);
    writeFileSync(output, 'partial');

    expect(cancelFfmpegJob('cancel')).toBe(true);
    child.emit('close', 1);

    await expect(promise).resolves.toEqual({ success: false, canceled: true });
    expect(child.kill).toHaveBeenCalled();
    // `rm` jest fire-and-forget, więc daj mu prawdziwy tick poza fake timerami.
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(existsSync(output)).toBe(false);
  });

  it('times out with the tool-specific message and kills FFmpeg', async () => {
    const sender = makeSender();
    const { child, promise } = start('timeout', sender);

    vi.advanceTimersByTime(MAX_FFMPEG_JOB_MS + 1);

    await expect(promise).resolves.toEqual({
      success: false,
      canceled: true,
      error: 'Conversion timed out'
    });
    expect(child.kill).toHaveBeenCalled();
  });

  it('reports a spawn failure instead of throwing', async () => {
    spawnMock.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });

    const result = await runFfmpegJob({
      jobId: 'spawn-fail',
      args: [],
      outputPath: output,
      durationSec: 0,
      sender: makeSender() as never,
      timeoutMessage: 'timed out',
      label: 'conversion',
      ffmpeg: 'ffmpeg'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot start FFmpeg');
  });

  it('parses out_time, ignores invalid values and computes an unknown percent', async () => {
    const sender = makeSender();
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runFfmpegJob({
      jobId: 'parse',
      args: [],
      outputPath: output,
      durationSec: 2,
      sender: sender as never,
      timeoutMessage: 'timed out',
      label: 'conversion',
      ffmpeg: 'ffmpeg'
    });
    writeFileSync(output, 'ok');

    child.stdout.emit('data', Buffer.from('out_time_us=not-a-number\n'));
    child.stdout.emit('data', Buffer.from('out_time=00:00:01.500\n'));
    expect(sender.send).toHaveBeenCalledWith(
      'tools:progress',
      expect.objectContaining({ percent: 75, timeSec: 1.5 })
    );

    child.stdout.emit('data', Buffer.from('speed=3x\n'));
    expect(sender.send).toHaveBeenLastCalledWith(
      'tools:progress',
      expect.objectContaining({ percent: 75, speed: '3x' })
    );

    child.stdout.emit('data', Buffer.from('unknown_key=1\nout_time_us=2000000\n'));
    expect(sender.send).toHaveBeenLastCalledWith(
      'tools:progress',
      expect.objectContaining({ percent: 100, timeSec: 2 })
    );

    child.emit('close', 0);
    await expect(promise).resolves.toMatchObject({ success: true });
  });

  it('handles split progress lines and ignores lines without a key', async () => {
    const sender = makeSender();
    const { child, promise } = start('split', sender);
    writeFileSync(output, 'ok');

    child.stdout.emit('data', Buffer.from('out_time_us=50'));
    child.stdout.emit('data', Buffer.from('0000\n=broken\nout_time_ms=1000000\n'));
    child.emit('close', 0);

    await promise;
    expect(sender.send).toHaveBeenCalledWith(
      'tools:progress',
      expect.objectContaining({ percent: 25 })
    );
    expect(sender.send).toHaveBeenCalledWith(
      'tools:progress',
      expect.objectContaining({ percent: 50 })
    );
  });

  it('returns stderr text when FFmpeg exits non-zero', async () => {
    const sender = makeSender();
    const { child, promise } = start('stderr', sender);

    child.stderr.emit('data', Buffer.from('  encoder exploded  \n'));
    child.emit('close', 1);

    await expect(promise).resolves.toEqual({ success: false, error: 'encoder exploded' });
  });

  it('falls back to the exit code and logs context when stderr is empty', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runFfmpegJob({
      jobId: 'exit-code',
      args: [],
      outputPath: output,
      durationSec: 1,
      sender: makeSender() as never,
      timeoutMessage: 'timed out',
      label: 'clip',
      logContext: 'in.mp4',
      ffmpeg: 'ffmpeg'
    });

    child.emit('close', 7);

    await expect(promise).resolves.toEqual({
      success: false,
      error: 'FFmpeg exited with code 7'
    });
  });

  it('treats a successful exit without an output file as a failure', async () => {
    const { child, promise } = start('missing-output', makeSender());

    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      success: false,
      error: 'FFmpeg exited with code 0'
    });
  });

  it('reports child process errors', async () => {
    const { child, promise } = start('child-error', makeSender());

    child.emit('error', new Error('killed'));

    await expect(promise).resolves.toEqual({ success: false, error: 'FFmpeg failed: killed' });
  });

  it('skips progress for a destroyed sender', async () => {
    const sender = { isDestroyed: () => true, send: vi.fn() };
    const { child, promise } = start('destroyed', sender as never);
    writeFileSync(output, 'ok');

    child.stdout.emit('data', Buffer.from('out_time_us=500000\n'));
    child.emit('close', 0);

    await promise;
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('cancels all active jobs and ignores unknown ids', async () => {
    const first = start('all-1', makeSender());
    const second = start('all-2', makeSender());

    expect(cancelFfmpegJob('missing')).toBe(false);
    expect(cancelAllFfmpegJobs()).toBe(2);

    first.child.emit('close', 1);
    second.child.emit('close', 1);
    await Promise.all([first.promise, second.promise]);
    expect(first.child.kill).toHaveBeenCalled();
    expect(second.child.kill).toHaveBeenCalled();
  });

  it('calls onFinish even when the output cannot be removed', async () => {
    const onFinish = vi.fn();
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runFfmpegJob({
      jobId: 'cleanup',
      args: [],
      outputPath: output,
      durationSec: 1,
      sender: makeSender() as never,
      timeoutMessage: 'timed out',
      label: 'conversion',
      onFinish,
      ffmpeg: 'ffmpeg'
    });

    child.emit('close', 1);

    await promise;
    expect(onFinish).toHaveBeenCalled();
  });

  it('resolves the bundled or bare ffmpeg binary when none is supplied', async () => {
    const settled = () => Promise.resolve().then(() => Promise.resolve());

    const resolved = startWithoutBinary('resolved-binary');
    await settled();
    resolved.child.emit('close', 1);
    await resolved.promise;
    expect(spawnMock).toHaveBeenLastCalledWith('/resolved/ffmpeg', [], { windowsHide: true });

    resolveBinMock.mockResolvedValueOnce(null);
    const bare = startWithoutBinary('bare-binary');
    await settled();
    bare.child.emit('close', 1);
    await bare.promise;
    expect(spawnMock).toHaveBeenLastCalledWith('ffmpeg', [], { windowsHide: true });
  });

  it('ignores events that arrive after the job settled', async () => {
    const { child, promise } = start('settled', makeSender());

    child.emit('error', new Error('first'));
    child.emit('close', 1);
    child.emit('error', new Error('second'));

    await expect(promise).resolves.toEqual({ success: false, error: 'FFmpeg failed: first' });
  });

  it('ignores cleanup failures for an unwritable output path', async () => {
    rmMock.fn.mockRejectedValueOnce(new Error('EACCES'));
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runFfmpegJob({
      jobId: 'rm-fail',
      args: [],
      outputPath: output,
      durationSec: 1,
      sender: makeSender() as never,
      timeoutMessage: 'timed out',
      label: 'conversion',
      ffmpeg: 'ffmpeg'
    });
    child.emit('close', 1);

    await expect(promise).resolves.toMatchObject({ success: false });
    await Promise.resolve();
    expect(rmMock.fn).toHaveBeenCalledWith(output, { force: true });
  });

  it('reports percent -1 for out_time_us without a known duration', async () => {
    const sender = makeSender();
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runFfmpegJob({
      jobId: 'unknown-duration',
      args: [],
      outputPath: output,
      durationSec: 0,
      sender: sender as never,
      timeoutMessage: 'timed out',
      label: 'conversion',
      ffmpeg: 'ffmpeg'
    });
    writeFileSync(output, 'ok');

    child.stdout.emit('data', Buffer.from('out_time_us=1000000\n'));
    child.stdout.emit('data', Buffer.from('out_time=00:00:01.000\n'));
    child.emit('close', 0);

    await promise;
    expect(sender.send).toHaveBeenCalledWith(
      'tools:progress',
      expect.objectContaining({ percent: -1, timeSec: 1 })
    );
  });

  function startWithoutBinary(jobId: string) {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const promise = runFfmpegJob({
      jobId,
      args: [],
      outputPath: output,
      durationSec: 1,
      sender: makeSender() as never,
      timeoutMessage: 'timed out',
      label: 'conversion'
    });
    return { child, promise };
  }
});
