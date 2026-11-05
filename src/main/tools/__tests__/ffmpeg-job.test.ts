import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('child_process', () => ({ spawn: spawnMock }));

const { MAX_FFMPEG_JOB_MS, cancelFfmpegJob, runFfmpegJob } = await import('../ffmpeg-job');

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
});
