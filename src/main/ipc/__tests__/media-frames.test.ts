import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// fps z ffprobe, znacznik czasu i zapis klatki PNG obok wideo.

const h = vi.hoisted(() => ({
  stdout: '24000/1001,24000/1001',
  runCommand: vi.fn(),
  resolveBin: vi.fn(),
  readable: true,
  warn: vi.fn(),
  writeFile: vi.fn(),
  realWriteFile: null as unknown as (...args: unknown[]) => Promise<void>,
  handlers: new Map<string, (...args: never[]) => unknown>()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) =>
      h.handlers.set(channel, handler)
  }
}));
vi.mock('../../binaries', () => ({ resolveBin: h.resolveBin }));
vi.mock('../../utils/exec', () => ({ runCommand: h.runCommand }));
vi.mock('../../media/read-access', () => ({ isReadableMediaPath: () => h.readable }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  h.realWriteFile = actual.writeFile as unknown as (...args: unknown[]) => Promise<void>;
  return { ...actual, writeFile: (...args: unknown[]) => h.writeFile(...args) };
});

const { parseFrameRate, timecode, getVideoFps, saveVideoScreenshot, registerMediaFrameHandlers } =
  await import('../media/media-frames');

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onda-frames-'));
  dirs.push(dir);
  return dir;
}

beforeEach(() => {
  h.stdout = '24000/1001,24000/1001';
  h.readable = true;
  h.runCommand.mockReset().mockImplementation(async () => h.stdout);
  h.resolveBin.mockReset().mockResolvedValue('/fake/ffprobe');
  h.writeFile.mockReset().mockImplementation((...args: unknown[]) => h.realWriteFile(...args));
  h.warn.mockClear();
  h.handlers.clear();
});

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('parseFrameRate', () => {
  it('parses fractional, integer and plain rates', () => {
    expect(parseFrameRate('24000/1001')).toBeCloseTo(23.976, 3);
    expect(parseFrameRate('30/1')).toBe(30);
    expect(parseFrameRate('25')).toBe(25);
  });

  it('returns 0 for empty or malformed input', () => {
    expect(parseFrameRate('')).toBe(0);
    expect(parseFrameRate('0/0')).toBe(0);
    expect(parseFrameRate('abc')).toBe(0);
    expect(parseFrameRate('-5/1')).toBe(0);
    expect(parseFrameRate('30/0')).toBe(0);
  });
});

describe('timecode', () => {
  it('formats seconds as HH-MM-SS', () => {
    expect(timecode(0)).toBe('00-00-00');
    expect(timecode(61)).toBe('00-01-01');
    expect(timecode(3661)).toBe('01-01-01');
  });

  it('clamps negative values to zero', () => {
    expect(timecode(-30)).toBe('00-00-00');
  });
});

describe('getVideoFps', () => {
  it('reads the frame rate from ffprobe and caches it', async () => {
    const dir = tempDir();
    const file = join(dir, 'movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    h.stdout = '24000/1001,24000/1001';

    await expect(getVideoFps(file)).resolves.toBeCloseTo(23.976, 3);
    await expect(getVideoFps(file)).resolves.toBeCloseTo(23.976, 3);
    expect(h.runCommand).toHaveBeenCalledTimes(1);
    expect(h.runCommand).toHaveBeenCalledWith(
      '/fake/ffprobe',
      expect.arrayContaining(['-show_entries', 'stream=r_frame_rate,avg_frame_rate', '--', file]),
      { timeout: 10000 }
    );
  });

  it('re-probes when the file changes on disk', async () => {
    const dir = tempDir();
    const file = join(dir, 'movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    await getVideoFps(file);

    const future = new Date(Date.now() + 60_000);
    utimesSync(file, future, future);

    await getVideoFps(file);
    expect(h.runCommand).toHaveBeenCalledTimes(2);
  });

  it('uses the average rate when r_frame_rate is unusable', async () => {
    const dir = tempDir();
    const file = join(dir, 'vfr.mkv');
    writeFileSync(file, Buffer.from('x'));
    h.stdout = '0/0,30000/1001';

    await expect(getVideoFps(file)).resolves.toBeCloseTo(29.97, 2);
  });

  it('falls back to 25 when ffprobe reports nothing usable', async () => {
    const dir = tempDir();
    const file = join(dir, 'weird.mkv');
    writeFileSync(file, Buffer.from('x'));
    h.stdout = '0/0,0/0';
    await expect(getVideoFps(file)).resolves.toBe(25);
  });

  it('runs a bare ffprobe when no bundled binary resolves', async () => {
    const dir = tempDir();
    const file = join(dir, 'single-rate.mkv');
    writeFileSync(file, Buffer.from('x'));
    h.resolveBin.mockResolvedValue(null);
    h.stdout = '25';

    await expect(getVideoFps(file)).resolves.toBe(25);
    expect(h.runCommand).toHaveBeenCalledWith('ffprobe', expect.any(Array), { timeout: 10000 });
  });

  it('falls back to 25 for a single unusable rate', async () => {
    const dir = tempDir();
    const file = join(dir, 'single-zero.mkv');
    writeFileSync(file, Buffer.from('x'));
    h.stdout = '0/0';

    await expect(getVideoFps(file)).resolves.toBe(25);
  });

  it('falls back to 25 and logs when ffprobe fails', async () => {
    const dir = tempDir();
    const file = join(dir, 'broken.mkv');
    writeFileSync(file, Buffer.from('x'));
    h.runCommand.mockRejectedValue(new Error('ffprobe missing'));

    await expect(getVideoFps(file)).resolves.toBe(25);
    expect(h.warn).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('fps probe failed'),
      expect.any(Error)
    );
  });

  it('evicts the oldest entry when the cache is full', async () => {
    const dir = tempDir();
    const files = Array.from({ length: 501 }, (_, i) => {
      const file = join(dir, `clip-${i}.mkv`);
      writeFileSync(file, Buffer.from('x'));
      return file;
    });
    for (const file of files) await getVideoFps(file);
    expect(h.runCommand).toHaveBeenCalledTimes(501);

    await getVideoFps(files[0]!);
    expect(h.runCommand).toHaveBeenCalledTimes(502);
  }, 30_000);
});

describe('saveVideoScreenshot', () => {
  it('writes the PNG next to the video with a timecode name', async () => {
    const dir = tempDir();
    const video = join(dir, 'Movie.mkv');
    writeFileSync(video, Buffer.from('x'));
    const png = [137, 80, 78, 71, 13, 10, 26, 10];

    const out = await saveVideoScreenshot(video, png, 61);
    expect(out).toBe(join(dir, 'Movie.frame-00-01-01.png'));
    expect(existsSync(out!)).toBe(true);
    expect(Array.from(readFileSync(out!))).toEqual(png);
  });

  it('rejects an invalid path or empty payload', async () => {
    const dir = tempDir();
    const video = join(dir, 'Movie.mkv');
    writeFileSync(video, Buffer.from('x'));
    await expect(saveVideoScreenshot('relative.mkv', [1], 0)).resolves.toBeNull();
    await expect(saveVideoScreenshot(video, [], 0)).resolves.toBeNull();
  });
});

describe('registerMediaFrameHandlers', () => {
  type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

  function handler(channel: string): Handler {
    registerMediaFrameHandlers();
    return h.handlers.get(channel) as Handler;
  }

  it('registers both channels', () => {
    registerMediaFrameHandlers();
    expect([...h.handlers.keys()]).toEqual(['media:getVideoFps', 'media:saveScreenshot']);
  });

  it('returns 0 for unsafe or unreadable paths without probing', async () => {
    const fps = handler('media:getVideoFps');

    await expect(fps(null, 'relative.mkv')).resolves.toBe(0);
    const dir = tempDir();
    const file = join(dir, 'movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    h.readable = false;
    await expect(fps(null, file)).resolves.toBe(0);
    expect(h.runCommand).not.toHaveBeenCalled();
  });

  it('returns the fps for a readable file', async () => {
    const dir = tempDir();
    const file = join(dir, 'movie.mkv');
    writeFileSync(file, Buffer.from('x'));

    await expect(handler('media:getVideoFps')(null, file)).resolves.toBeCloseTo(23.976, 3);
  });

  it('saves a screenshot and reports its path', async () => {
    const dir = tempDir();
    const video = join(dir, 'Movie.mkv');
    writeFileSync(video, Buffer.from('x'));

    await expect(handler('media:saveScreenshot')(null, video, [1, 2, 3], 5)).resolves.toEqual({
      success: true,
      path: join(dir, 'Movie.frame-00-00-05.png')
    });
  });

  it('treats a non-numeric timestamp as zero and rejects invalid requests', async () => {
    const dir = tempDir();
    const video = join(dir, 'Movie.mkv');
    writeFileSync(video, Buffer.from('x'));
    const save = handler('media:saveScreenshot');

    await expect(save(null, video, [1], undefined)).resolves.toEqual({
      success: true,
      path: join(dir, 'Movie.frame-00-00-00.png')
    });
    await expect(save(null, video, 'nope', 0)).resolves.toEqual({
      success: false,
      error: 'invalid-request'
    });
  });

  it('returns the failure reason when the PNG cannot be written', async () => {
    const dir = tempDir();
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory');

    await expect(
      handler('media:saveScreenshot')(null, join(blocker, 'Movie.mkv'), [1], 0)
    ).resolves.toMatchObject({ success: false, error: expect.any(String) });
    expect(h.warn).toHaveBeenCalledWith('media', 'saveScreenshot failed', expect.anything());
  });

  it('stringifies a thrown non-Error value', async () => {
    const dir = tempDir();
    h.writeFile.mockRejectedValueOnce(null);

    await expect(
      handler('media:saveScreenshot')(null, join(dir, 'Movie.mkv'), [1], 0)
    ).resolves.toEqual({ success: false, error: 'null' });
  });
});
