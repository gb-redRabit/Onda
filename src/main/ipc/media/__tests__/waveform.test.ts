import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  spawn: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  resolveBin: vi.fn(),
  safeUserData: vi.fn(),
  warn: vi.fn(),
  child: null as any
}));

vi.mock('child_process', () => ({ spawn: state.spawn }));
vi.mock('fs/promises', () => ({
  mkdir: state.mkdir,
  readFile: state.readFile,
  stat: state.stat,
  writeFile: state.writeFile
}));
vi.mock('../../../binaries', () => ({ resolveBin: state.resolveBin }));
vi.mock('../../../utils/profile-state', () => ({ safeUserDataPath: state.safeUserData }));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  return import('../waveform');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function fileStats(size = 1000, mtimeMs = 5000) {
  return { size, mtimeMs, isFile: () => true };
}

function makeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.spawn.mockReset();
  state.readFile.mockReset();
  state.mkdir.mockReset();
  state.writeFile.mockReset();
  state.stat.mockReset();
  state.resolveBin.mockReset();
  state.safeUserData.mockReset();
  state.warn.mockReset();
  state.safeUserData.mockReturnValue('C:/user');
  state.stat.mockResolvedValue(fileStats());
  state.readFile.mockRejectedValue(new Error('ENOENT'));
  state.mkdir.mockResolvedValue(undefined);
  state.writeFile.mockResolvedValue(undefined);
  state.resolveBin.mockResolvedValue('ffmpeg');
  state.child = makeChild();
  state.spawn.mockReturnValue(state.child);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('downsamplePeaks', () => {
  it('returns a copy when no downsampling is needed', async () => {
    const { downsamplePeaks } = await load();
    const peaks = [0, 0.5, 1];
    const result = downsamplePeaks(peaks, 5);
    expect(result).toEqual(peaks);
    expect(result).not.toBe(peaks);
  });

  it('keeps the max value in each bucket', async () => {
    const { downsamplePeaks } = await load();
    expect(downsamplePeaks([1, 2, 3, 4, 5], 2)).toEqual([2, 5]);
    expect(downsamplePeaks([1, 2, 3], 0)).toEqual([3]);
  });

  it('handles width larger than one and empty input', async () => {
    const { downsamplePeaks } = await load();
    expect(downsamplePeaks([], 3)).toEqual([]);
    expect(downsamplePeaks([1, 2, 3, 4], 1)).toEqual([4]);
  });
});

describe('PeakAccumulator', () => {
  it('groups samples into buckets and flushes the partial bucket', async () => {
    const { PeakAccumulator } = await load();
    const acc = new PeakAccumulator(2, 100);
    acc.push(new Int16Array([0, 16384, -32768]));
    expect(acc.finish()).toEqual([0.5, 1]);
  });

  it('clamps samples-per-bucket to at least one', async () => {
    const { PeakAccumulator } = await load();
    const acc = new PeakAccumulator(0, 100);
    acc.push(new Int16Array([0, 0.5 * 32768]));
    expect(acc.finish()).toHaveLength(2);
  });

  it('downsamples to the max point count', async () => {
    const { PeakAccumulator } = await load();
    const acc = new PeakAccumulator(1, 2);
    acc.push(new Int16Array([32768, 100, 200, 300]));
    expect(acc.finish()).toHaveLength(2);
  });

  it('computes peaks through computePeaks', async () => {
    const { computePeaks } = await load();
    expect(computePeaks(new Int16Array([32768, 0, 16384, 0]), 2)).toEqual([1, 0.5]);
  });
});

describe('getWaveform cache and guards', () => {
  it('returns an empty waveform when stat fails or the path is not a file', async () => {
    state.stat.mockRejectedValueOnce(new Error('missing'));
    let module = await load();
    expect(await module.getWaveform('C:/missing.mp3')).toEqual([]);

    state.stat.mockResolvedValueOnce({ ...fileStats(), isFile: () => false });
    module = await load();
    expect(await module.getWaveform('C:/dir')).toEqual([]);
    expect(state.resolveBin).not.toHaveBeenCalled();
  });

  it('returns cached peaks without invoking ffmpeg', async () => {
    state.readFile.mockResolvedValueOnce(
      JSON.stringify({ version: 1, size: 1000, mtime: 5000, peaks: [0, 1] })
    );
    const { getWaveform } = await load();

    expect(await getWaveform('C:/music/a.mp3', 60)).toEqual([0, 1]);
    expect(state.resolveBin).not.toHaveBeenCalled();
    expect(state.readFile).toHaveBeenCalledWith(expect.stringContaining('waveform-cache'), 'utf-8');
  });

  it('ignores stale or malformed cache entries', async () => {
    state.readFile.mockResolvedValueOnce(
      JSON.stringify({ version: 99, size: 1000, mtime: 5000, peaks: [1] })
    );
    const { getWaveform } = await load();
    const promise = getWaveform('C:/music/a.mp3', 1);
    await flush();
    expect(state.spawn).toHaveBeenCalled();
    state.child.emit('close', 0);
    await promise;

    state.readFile.mockResolvedValueOnce('not json');
    const second = getWaveform('C:/music/b.mp3', 1);
    await flush();
    state.spawn.mockReturnValue(state.child);
    state.child.emit('close', 0);
    await second;
  });

  it('returns empty when ffmpeg is unavailable', async () => {
    state.resolveBin.mockResolvedValueOnce(null);
    const { getWaveform } = await load();
    expect(await getWaveform('C:/music/a.mp3', 60)).toEqual([]);
  });
});

describe('decoding', () => {
  it('decodes PCM data, carries odd bytes and writes the cache', async () => {
    const { getWaveform } = await load();
    const promise = getWaveform('C:/music/a.mp3', 0.5);
    await flush();

    const samples = Buffer.alloc(8);
    samples.writeInt16LE(0, 0);
    samples.writeInt16LE(1000, 2);
    samples.writeInt16LE(-32768, 4);
    samples.writeInt16LE(2000, 6);
    state.child.stdout.emit('data', samples.subarray(0, 3));
    state.child.stdout.emit('data', samples.subarray(3));
    state.child.emit('close', 0);

    const peaks = await promise;
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(1000 / 32768, 5);
    expect(peaks[1]).toBe(1);
    expect(state.mkdir).toHaveBeenCalledWith(expect.stringContaining('waveform-cache'), {
      recursive: true
    });
    expect(state.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/waveform-cache[/\\].*\.json$/),
      expect.any(String),
      'utf-8'
    );
  });

  it('falls back to 2-second buckets without a duration', async () => {
    const { getWaveform } = await load();
    const promise = getWaveform('C:/music/a.mp3', 0);
    await flush();
    state.child.stdout.emit('data', Buffer.alloc(4));
    state.child.emit('close', 0);
    expect(await promise).toEqual([0]);
  });

  it('rejects non-zero exits and child errors', async () => {
    let module = await load();
    let promise = module.getWaveform('C:/music/a.mp3', 1);
    await flush();
    state.child.emit('close', 1);
    expect(await promise).toEqual([]);
    expect(state.warn).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('waveform decode failed'),
      expect.any(Error)
    );

    module = await load();
    promise = module.getWaveform('C:/music/b.mp3', 1);
    await flush();
    state.child.emit('error', new Error('spawn failed'));
    expect(await promise).toEqual([]);
  });

  it('aborts before and during decoding without logging', async () => {
    let module = await load();
    const pre = new AbortController();
    pre.abort();
    expect(await module.getWaveform('C:/music/a.mp3', 1, pre.signal)).toEqual([]);

    module = await load();
    const controller = new AbortController();
    const promise = module.getWaveform('C:/music/b.mp3', 1, controller.signal);
    await flush();
    controller.abort();
    expect(state.child.kill).toHaveBeenCalled();
    expect(await promise).toEqual([]);
    expect(state.warn).not.toHaveBeenCalled();
  });

  it('times out long decodes and kills ffmpeg', async () => {
    const { getWaveform } = await load();
    const promise = getWaveform('C:/music/a.mp3', 1);
    await flush();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(state.child.kill).toHaveBeenCalled();
    expect(await promise).toEqual([]);
    expect(state.warn).toHaveBeenCalled();
  });

  it('ignores duplicate pushes while decoding', async () => {
    const { getWaveform } = await load();
    const first = getWaveform('C:/music/a.mp3', 1);
    const second = getWaveform('C:/music/a.mp3', 1);
    await flush();
    state.child.emit('close', 0);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(state.spawn).toHaveBeenCalledTimes(1);
  });

  it('does not write a cache for empty peaks', async () => {
    const { getWaveform } = await load();
    const promise = getWaveform('C:/music/a.mp3', 1);
    await flush();
    state.child.emit('close', 0);
    await promise;
    expect(state.writeFile).not.toHaveBeenCalled();
  });

  it('keeps decoding when cache writes fail', async () => {
    state.writeFile.mockRejectedValueOnce(new Error('disk'));
    const { getWaveform } = await load();
    const promise = getWaveform('C:/music/a.mp3', 0.5);
    await flush();
    const samples = Buffer.alloc(8);
    samples.writeInt16LE(1000, 0);
    samples.writeInt16LE(2000, 2);
    samples.writeInt16LE(3000, 4);
    samples.writeInt16LE(4000, 6);
    state.child.stdout.emit('data', samples);
    state.child.emit('close', 0);
    expect(await promise).toHaveLength(2);
    expect(state.warn).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('waveform cache write failed'),
      expect.any(Error)
    );
  });

  it('uses the temp dir when no user data path is available', async () => {
    state.safeUserData.mockReturnValue(null);
    const { getWaveform } = await load();
    state.resolveBin.mockResolvedValueOnce(null);
    await getWaveform('C:/music/a.mp3', 1);
    expect(state.readFile).toHaveBeenCalledWith(expect.stringContaining('onda'), 'utf-8');
  });
});
