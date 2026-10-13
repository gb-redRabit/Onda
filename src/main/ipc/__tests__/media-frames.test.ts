import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// fps z ffprobe, znacznik czasu i zapis klatki PNG obok wideo.

const state = vi.hoisted(() => ({
  stdout: '24000/1001,24000/1001'
}));

vi.mock('electron', () => ({ ipcMain: { handle: () => {} } }));
vi.mock('../../binaries', () => ({ resolveBin: async (name: string) => `/fake/${name}` }));
vi.mock('../../utils/exec', () => ({
  runCommand: async () => state.stdout
}));

const { parseFrameRate, timecode, getVideoFps, saveVideoScreenshot } =
  await import('../media/media-frames');

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onda-frames-'));
  dirs.push(dir);
  return dir;
}

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
  });
});

describe('timecode', () => {
  it('formats seconds as HH-MM-SS', () => {
    expect(timecode(0)).toBe('00-00-00');
    expect(timecode(61)).toBe('00-01-01');
    expect(timecode(3661)).toBe('01-01-01');
  });
});

describe('getVideoFps', () => {
  it('reads the frame rate from ffprobe and caches it', async () => {
    const dir = tempDir();
    const file = join(dir, 'movie.mkv');
    writeFileSync(file, Buffer.from('x'));
    state.stdout = '24000/1001,24000/1001';
    await expect(getVideoFps(file)).resolves.toBeCloseTo(23.976, 3);
  });

  it('falls back to 25 when ffprobe reports nothing usable', async () => {
    const dir = tempDir();
    const file = join(dir, 'weird.mkv');
    writeFileSync(file, Buffer.from('x'));
    state.stdout = '0/0,0/0';
    await expect(getVideoFps(file)).resolves.toBe(25);
  });
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
