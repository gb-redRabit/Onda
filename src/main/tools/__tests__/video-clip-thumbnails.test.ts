import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  spawn: vi.fn(),
  child: null as any,
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  tmpdir: vi.fn(),
  resolveBin: vi.fn(),
  runCommand: vi.fn(),
  probeDuration: vi.fn(),
  buildArgs: vi.fn(),
  parseFrameRate: vi.fn(),
  safePath: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn()
}));

vi.mock('child_process', () => ({ spawn: state.spawn }));
vi.mock('fs/promises', () => ({
  mkdtemp: state.mkdtemp,
  readFile: state.readFile,
  rm: state.rm,
  stat: state.stat
}));
vi.mock('os', () => ({ tmpdir: state.tmpdir }));
vi.mock('path', () => ({ join: (...parts: string[]) => parts.join('/') }));
vi.mock('../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.warn, info: state.info, error: state.error }
}));
vi.mock('../../utils/validate', () => ({ isSafeAbsolutePath: state.safePath }));
vi.mock('../../utils/exec', () => ({ runCommand: state.runCommand }));
vi.mock('../media-convert', () => ({ probeDuration: state.probeDuration }));
vi.mock('../video-clip-args', () => ({
  buildClipThumbnailArgs: state.buildArgs,
  MAX_CLIP_THUMBNAILS: 50,
  parseFrameRate: state.parseFrameRate
}));

function fakeChild() {
  const child = new EventEmitter() as any;
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    inputPath: 'C:/video/clip.mp4',
    startSec: 5,
    endSec: 15,
    count: 4,
    ...overrides
  } as any;
}

beforeEach(() => {
  state.spawn.mockReset();
  state.mkdtemp.mockReset();
  state.readFile.mockReset();
  state.rm.mockReset();
  state.stat.mockReset();
  state.tmpdir.mockReset();
  state.resolveBin.mockReset();
  state.runCommand.mockReset();
  state.probeDuration.mockReset();
  state.buildArgs.mockReset();
  state.parseFrameRate.mockReset();
  state.safePath.mockReset();
  state.warn.mockReset();

  state.safePath.mockReturnValue(true);
  state.stat.mockResolvedValue({ isFile: () => true });
  state.mkdtemp.mockResolvedValue('C:/temp/thumbs');
  state.buildArgs.mockReturnValue(['-i', 'input', 'thumb-%02d.jpg']);
  state.resolveBin.mockImplementation(async (name: string) => `/bin/${name}`);
  state.runCommand.mockResolvedValue(
    JSON.stringify({
      streams: [{ avg_frame_rate: '30/1', r_frame_rate: '25/1' }],
      format: { duration: '60' }
    })
  );
  state.parseFrameRate.mockImplementation((value: string | undefined) => {
    if (!value) return 0;
    return Number(value.split('/')[0]) || 0;
  });
  state.probeDuration.mockResolvedValue(100);
  state.readFile.mockResolvedValue(Buffer.from('abc'));
  state.rm.mockResolvedValue(undefined);
  state.tmpdir.mockReturnValue('C:/temp');
  state.child = fakeChild();
  state.spawn.mockReturnValue(state.child);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('validation', () => {
  it('rejects missing requests and unsafe paths', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    expect(await clipThumbnails(null as never)).toEqual({
      success: false,
      error: 'Invalid input path'
    });
    state.safePath.mockReturnValueOnce(false);
    expect(await clipThumbnails(request())).toEqual({
      success: false,
      error: 'Invalid input path'
    });
  });

  it('rejects missing files and directories', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.stat.mockResolvedValueOnce({ isFile: () => false });
    expect(await clipThumbnails(request())).toEqual({
      success: false,
      error: 'Input file does not exist'
    });

    state.stat.mockRejectedValueOnce(new Error('ENOENT'));
    expect(await clipThumbnails(request())).toEqual({
      success: false,
      error: 'Input file does not exist'
    });
  });

  it('rejects videos without a known duration', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.runCommand.mockResolvedValueOnce(JSON.stringify({ streams: [], format: {} }));
    state.probeDuration.mockResolvedValueOnce(0);
    expect(await clipThumbnails(request())).toEqual({
      success: false,
      error: 'Unknown video duration'
    });
    expect(state.spawn).not.toHaveBeenCalled();
  });
});

describe('probing', () => {
  it('falls back to probeDuration and default fps when probing fails', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.runCommand.mockRejectedValueOnce(new Error('probe'));
    state.probeDuration.mockResolvedValueOnce(30);
    const promise = clipThumbnails(request({ count: 2 }));
    await flush();
    state.child.emit('close', 0);
    await promise;

    expect(state.probeDuration).toHaveBeenCalledWith('C:/video/clip.mp4');
    expect(state.buildArgs).toHaveBeenCalledWith(
      'C:/video/clip.mp4',
      'C:/temp/thumbs/thumb-%02d.jpg',
      10,
      2,
      5
    );
  });

  it('uses the r_frame_rate fallback and falls back to ffprobe names', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.runCommand.mockResolvedValueOnce(
      JSON.stringify({ streams: [{ r_frame_rate: '24/1' }], format: { duration: '20' } })
    );
    state.resolveBin.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const promise = clipThumbnails(request({ count: 1 }));
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.runCommand.mock.calls[0][0]).toBe('ffprobe');
    expect(state.spawn.mock.calls[0][0]).toBe('ffmpeg');
  });

  it('clamps start and end into the duration range', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    const promise = clipThumbnails(request({ startSec: -10, endSec: 999, count: 3 }));
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.buildArgs).toHaveBeenCalledWith(
      'C:/video/clip.mp4',
      'C:/temp/thumbs/thumb-%02d.jpg',
      60,
      3,
      0
    );
  });

  it('computes the default count from the selected span and fps', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    const promise = clipThumbnails(request({ startSec: 10, endSec: 12, count: undefined }));
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.buildArgs.mock.calls[0][3]).toBe(50);
  });

  it('uses ten thumbnails for the full duration and floors fractional counts', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    let promise = clipThumbnails(request({ startSec: 0, endSec: 60, count: undefined }));
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.buildArgs.mock.calls[0][3]).toBe(10);

    state.child = fakeChild();
    state.spawn.mockReturnValue(state.child);
    promise = clipThumbnails(request({ count: 3.9 }));
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.buildArgs.mock.calls[1][3]).toBe(3);
  });

  it('clamps explicit counts into the supported range', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    let promise = clipThumbnails(request({ count: -5 }));
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.buildArgs.mock.calls[0][3]).toBe(1);

    state.child = fakeChild();
    state.spawn.mockReturnValue(state.child);
    promise = clipThumbnails(request({ count: 9999 }));
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.buildArgs.mock.calls[1][3]).toBe(50);
  });
});

describe('frame extraction', () => {
  it('returns base64 frames and stops at the first missing file', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.readFile
      .mockResolvedValueOnce(Buffer.from('one'))
      .mockResolvedValueOnce(Buffer.from('two'))
      .mockRejectedValueOnce(new Error('missing'));

    const promise = clipThumbnails(request({ count: 4 }));
    await flush();
    state.child.emit('close', 0);
    const result = await promise;

    expect(result).toMatchObject({
      success: true,
      fps: 30,
      duration: 60,
      startSec: 5,
      stepSec: 2.5
    });
    expect(result.frames).toEqual([
      `data:image/jpeg;base64,${Buffer.from('one').toString('base64')}`,
      `data:image/jpeg;base64,${Buffer.from('two').toString('base64')}`
    ]);
    expect(state.readFile).toHaveBeenCalledTimes(3);
  });

  it('fails when no thumbnails could be read', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.readFile.mockRejectedValue(new Error('missing'));
    const promise = clipThumbnails(request());
    await flush();
    state.child.emit('close', 0);
    expect(await promise).toEqual({ success: false, error: 'No thumbnails generated' });
  });

  it('cleans up the temporary directory in every outcome', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.readFile.mockRejectedValue(new Error('missing'));
    const promise = clipThumbnails(request());
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.rm).toHaveBeenCalledWith('C:/temp/thumbs', { recursive: true, force: true });
  });
});

describe('ffmpeg failures', () => {
  it('reports spawn failures', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.spawn.mockImplementation(() => {
      throw new Error('no binary');
    });
    expect(await clipThumbnails(request())).toEqual({
      success: false,
      error: 'Cannot start FFmpeg: Error: no binary'
    });
    expect(state.rm).toHaveBeenCalled();
  });

  it('reports child process errors', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    const promise = clipThumbnails(request());
    await flush();
    state.child.emit('error', new Error('crashed'));
    expect(await promise).toEqual({ success: false, error: 'FFmpeg failed: crashed' });
  });

  it('reports stderr and exit codes for non-zero exits', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    let promise = clipThumbnails(request());
    await flush();
    const first = state.child;
    first.stderr.emit('data', Buffer.from('bad input'));
    first.emit('close', 1);
    expect(await promise).toEqual({ success: false, error: 'bad input' });

    state.child = fakeChild();
    state.spawn.mockReturnValue(state.child);
    promise = clipThumbnails(request());
    await flush();
    state.child.emit('close', 2);
    expect(await promise).toEqual({ success: false, error: 'FFmpeg exited with code 2' });
  });

  it('kills ffmpeg after the timeout', async () => {
    vi.useFakeTimers();
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    const promise = clipThumbnails(request());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await promise).toEqual({ success: false, error: 'Thumbnail generation timed out' });
    expect(state.child.kill).toHaveBeenCalled();
  });

  it('tolerates a kill failure on timeout', async () => {
    vi.useFakeTimers();
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.child.kill.mockImplementation(() => {
      throw new Error('already gone');
    });
    const promise = clipThumbnails(request());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await promise).toEqual({ success: false, error: 'Thumbnail generation timed out' });
  });

  it('ignores late events after settling', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    const promise = clipThumbnails(request());
    await flush();
    state.child.emit('close', 0);
    state.child.emit('error', new Error('late'));
    state.child.emit('close', 1);
    expect((await promise).success).toBe(true);
  });

  it('reports unexpected setup failures and still cleans up', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.mkdtemp.mockRejectedValueOnce(new Error('temp unavailable'));
    expect(await clipThumbnails(request())).toEqual({
      success: false,
      error: 'temp unavailable'
    });
    expect(state.warn).toHaveBeenCalledWith(
      'tools',
      'clip thumbnails failed for C:/video/clip.mp4',
      expect.any(Error)
    );
    expect(state.rm).not.toHaveBeenCalled();
  });

  it('swallows cleanup failures', async () => {
    const { clipThumbnails } = await import('../video-clip-thumbnails');
    state.rm.mockRejectedValueOnce(new Error('busy'));
    state.readFile.mockRejectedValue(new Error('missing'));
    const promise = clipThumbnails(request());
    await flush();
    state.child.emit('close', 0);
    await expect(promise).resolves.toEqual({
      success: false,
      error: 'No thumbnails generated'
    });
  });
});
