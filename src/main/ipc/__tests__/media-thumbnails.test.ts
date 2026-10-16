import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Wideo musi dostawać miniaturę z PRAWDZIWEJ klatki (FFmpeg), a nie z miniatury
// systemowej shell (która na Windows bywa ikoną/generykiem). Testy izolują ffmpeg,
// sharp i electron, a prawdziwy system plików obsługuje pliki tymczasowe.

const mocks = vi.hoisted(() => ({
  runCommand: vi.fn(),
  resolveBin: vi.fn(async () => '/usr/bin/ffmpeg'),
  createThumbnailFromPath: vi.fn(async () => ({
    isEmpty: () => true,
    toJPEG: () => Buffer.from('system')
  })),
  getFileIcon: vi.fn(async () => ({ isEmpty: () => true, toJPEG: () => Buffer.from('icon') })),
  extractAndCacheCover: vi.fn(async () => ({ type: null, data: null }))
}));

vi.mock('electron', () => ({
  app: { getFileIcon: mocks.getFileIcon },
  nativeImage: { createThumbnailFromPath: mocks.createThumbnailFromPath }
}));
vi.mock('../../binaries', () => ({ resolveBin: mocks.resolveBin }));
vi.mock('../../utils/exec', () => ({ runCommand: mocks.runCommand }));
vi.mock('../cover/cover-cache', () => ({ extractAndCacheCover: mocks.extractAndCacheCover }));
vi.mock('sharp', () => ({
  default: () => ({
    resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from('sharp-thumb') }) })
  })
}));

import { getThumbnail, videoFrameArgs, videoFrameThumbnail } from '../media/media-thumbnails';

let seq = 0;
const uniquePath = (name: string): string =>
  join(tmpdir(), `onda-thumbtest-${process.pid}-${Date.now()}-${seq++}`, name);

describe('videoFrameArgs', () => {
  it('builds single-frame ffmpeg args with the seek and output path', () => {
    const args = videoFrameArgs('/v/clip.mp4', '/out/f.jpg', '1');
    expect(args).toEqual(
      expect.arrayContaining(['-i', '/v/clip.mp4', '-frames:v', '1', '-ss', '1'])
    );
    expect(args[args.length - 2]).toBe('/out/f.jpg');
    expect(args[args.length - 1]).toBe('-y');
  });
});

describe('video frame thumbnail (FFmpeg)', () => {
  beforeEach(() => {
    mocks.runCommand.mockReset();
    mocks.resolveBin.mockResolvedValue('/usr/bin/ffmpeg');
    mocks.createThumbnailFromPath.mockClear();
    mocks.extractAndCacheCover.mockClear();
  });

  it('extracts a real frame for videos and never asks the OS shell', async () => {
    mocks.runCommand.mockImplementation(async (_bin: string, args: string[]) => {
      await writeFile(args[args.length - 2], Buffer.from('frame'));
      return '';
    });

    const url = await getThumbnail(uniquePath('movie.mp4'), 320);

    expect(url).toMatch(/^data:image\/jpeg;base64,/);
    expect(mocks.runCommand).toHaveBeenCalledTimes(1);
    expect(mocks.runCommand.mock.calls[0][0]).toBe('/usr/bin/ffmpeg');
    expect(mocks.createThumbnailFromPath).not.toHaveBeenCalled();
  });

  it('retries at seek 0 when the 1s frame is empty (very short clips)', async () => {
    let call = 0;
    mocks.runCommand.mockImplementation(async (_bin: string, args: string[]) => {
      call += 1;
      if (call > 1) await writeFile(args[args.length - 2], Buffer.from('frame'));
      return '';
    });

    const buf = await videoFrameThumbnail(uniquePath('short.mp4'), 320);

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(mocks.runCommand).toHaveBeenCalledTimes(2);
    expect(mocks.runCommand.mock.calls[1][1]).toEqual(expect.arrayContaining(['-ss', '0']));
  });

  it('returns null when no frame can be extracted', async () => {
    mocks.runCommand.mockResolvedValue('');
    expect(await videoFrameThumbnail(uniquePath('broken.mp4'), 320)).toBeNull();
  });

  it('does not run FFmpeg for non-video files', async () => {
    const url = await getThumbnail(uniquePath('photo.png'), 320);
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });
});
