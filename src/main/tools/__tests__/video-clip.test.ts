import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildClipArgs,
  buildClipThumbnailArgs,
  buildConcatArgs,
  parseFrameRate,
  resolveClipOutputPath,
  resolveConcatOutputPath
} from '../video-clip';
import { parseTimeToSeconds } from '../video-clip-args';

const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'onda-clip-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('video clip args', () => {
  it('copies the selected range without re-encoding', () => {
    const args = buildClipArgs('/in.mp4', '/out.mp4', 12.5, 25, {
      container: 'mp4',
      mode: 'copy'
    });
    expect(args).toContain('-ss');
    expect(args).toContain('12.500');
    expect(args).toContain('-t');
    expect(args).toContain('12.500');
    expect(args).toContain('-c');
    expect(args).toContain('copy');
    expect(args).toContain('+faststart');
    expect(args).toContain('0:a:0?');
    expect(args).not.toContain('-an');
  });

  it('removes audio with stream copy and skips faststart for MKV', () => {
    const args = buildClipArgs('/in.mp4', '/out.mkv', 1, 2, {
      container: 'mkv',
      mode: 'copy',
      audio: 'remove'
    });
    expect(args).toContain('-an');
    expect(args).not.toContain('0:a:0?');
    expect(args).not.toContain('+faststart');
  });

  it('reencodes after the input in exact mode for frame-accurate cuts', () => {
    const args = buildClipArgs('/in.mp4', '/out.mp4', 1, 2, {
      container: 'mp4',
      mode: 'exact',
      encoder: 'libopenh264'
    });
    expect(args.indexOf('-ss')).toBeGreaterThan(args.indexOf('-i'));
    expect(args).toContain('libopenh264');
    expect(args).toContain('aac');
    expect(args).not.toContain('copy');
  });

  it('uses VP9 and Opus for exact WebM output', () => {
    const args = buildClipArgs('/in.mp4', '/out.webm', 1, 2, {
      container: 'webm',
      mode: 'exact'
    });
    expect(args).toContain('libvpx-vp9');
    expect(args).toContain('libopus');
  });

  it('reencodes when rotating or muting even if copy mode is selected', () => {
    const args = buildClipArgs('/in.mp4', '/out.mp4', 1, 2, {
      container: 'mp4',
      mode: 'copy',
      audio: 'mute',
      rotation: 90,
      encoder: 'libx264'
    });
    expect(args).toContain('-vf');
    expect(args).toContain('transpose=1');
    expect(args).toContain('-af');
    expect(args).not.toContain('copy');
  });

  it('builds a palette-based GIF export', () => {
    const args = buildClipArgs('/in.mp4', '/out.gif', 1, 2, {
      container: 'mp4',
      mode: 'copy',
      format: 'gif',
      rotation: 180
    });
    expect(args).toContain('-filter_complex');
    expect(args.join(' ')).toContain('palettegen');
    expect(args.join(' ')).toContain('transpose=2,transpose=2');
    expect(args).toContain('-an');
  });

  it('builds a GIF without a rotation filter', () => {
    const args = buildClipArgs('/in.mp4', '/out.gif', 0, 1, {
      container: 'mp4',
      mode: 'copy',
      format: 'gif'
    });
    expect(args.join(' ')).not.toContain('transpose');
    expect(args.join(' ')).toContain('fps=12,scale=480');
  });

  it('caps video bitrate for a target file size', () => {
    const args = buildClipArgs('/in.mp4', '/out.mp4', 0, 10, {
      container: 'mp4',
      mode: 'exact',
      targetSizeMb: 10,
      encoder: 'libx264'
    });
    expect(args).toContain('-b:v');
    expect(args).toContain('8000k');
    expect(args).not.toContain('-crf');
  });

  it('maps rotation 270 and the mpeg4 encoder for a target size', () => {
    const rotated = buildClipArgs('/in.mp4', '/out.mp4', 0, 1, {
      container: 'mp4',
      mode: 'exact',
      rotation: 270
    });
    expect(rotated).toContain('transpose=2');

    const mpeg = buildClipArgs('/in.mp4', '/out.mp4', 0, 10, {
      container: 'mp4',
      mode: 'exact',
      targetSizeMb: 5,
      encoder: 'mpeg4'
    });
    expect(mpeg).toContain('mpeg4');
    expect(mpeg).not.toContain('-preset');
  });

  it('encodes WebM with a target bitrate and without audio', () => {
    const args = buildClipArgs('/in.mp4', '/out.webm', 0, 10, {
      container: 'webm',
      mode: 'exact',
      targetSizeMb: 5,
      audio: 'remove'
    });
    expect(args).toContain('libvpx-vp9');
    expect(args).toContain('-b:v');
    expect(args).toContain('-an');
  });

  it('falls back to mpeg4 for other encoders and mutes exact output', () => {
    const fallback = buildClipArgs('/in.mp4', '/out.mp4', 0, 1, {
      container: 'mp4',
      mode: 'exact',
      encoder: 'mpeg4'
    });
    expect(fallback).toContain('mpeg4');
    expect(fallback).toContain('-q:v');

    const hardware = buildClipArgs('/in.mp4', '/out.mp4', 0, 1, {
      container: 'mp4',
      mode: 'exact',
      encoder: 'h264_mf',
      audio: 'remove'
    });
    expect(hardware).toContain('h264_mf');
    expect(hardware).toContain('-an');
  });
});

describe('parseFrameRate', () => {
  it('parses rational and integer frame rates', () => {
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseFrameRate('25')).toBe(25);
    expect(parseFrameRate('0/0')).toBe(0);
    expect(parseFrameRate('')).toBe(0);
  });

  it('rejects non-string, non-finite and out-of-range values', () => {
    expect(parseFrameRate(null)).toBe(0);
    expect(parseFrameRate('abc')).toBe(0);
    expect(parseFrameRate('1001/1')).toBe(0);
  });
});

describe('parseTimeToSeconds', () => {
  it('parses HH:MM:SS and rejects malformed values', () => {
    expect(parseTimeToSeconds('01:02:03.5')).toBeCloseTo(3723.5);
    expect(parseTimeToSeconds('bad')).toBe(0);
  });
});

describe('video clip thumbnails', () => {
  it('samples frames evenly across the full duration', () => {
    const args = buildClipThumbnailArgs('/in.mp4', '/tmp/thumb-%02d.jpg', 20, 10);
    expect(args).toContain('-vf');
    expect(args).toContain('fps=0.500000,scale=160:-2');
    expect(args).toContain('-frames:v');
    expect(args).toContain('10');
    expect(args).toContain('/tmp/thumb-%02d.jpg');
  });

  it('clamps the requested frame count', () => {
    const args = buildClipThumbnailArgs('/in.mp4', '/tmp/thumb-%02d.jpg', 10, 999);
    expect(args).toContain('120');
    expect(args).toContain('fps=12.000000,scale=160:-2');
  });

  it('seeks to the requested window for a frame strip', () => {
    const args = buildClipThumbnailArgs('/in.mp4', '/tmp/thumb-%02d.jpg', 1, 30, 2);
    expect(args.slice(0, 7)).toEqual([
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      '2.000',
      '-i'
    ]);
    expect(args).toContain('fps=30.000000,scale=160:-2');
  });

  it('falls back to defaults for an empty duration and count', () => {
    const args = buildClipThumbnailArgs('/in.mp4', '/tmp/thumb-%02d.jpg', 0, 0);
    expect(args).toContain('fps=1.000000,scale=160:-2');
    expect(args).toContain('10');
    expect(args).not.toContain('-ss');
  });
});

describe('video concat args', () => {
  it('uses the concat demuxer with stream copy', () => {
    const args = buildConcatArgs('/tmp/inputs.txt', '/out.mp4', {
      container: 'mp4',
      mode: 'copy'
    });
    expect(args).toContain('-f');
    expect(args).toContain('concat');
    expect(args).toContain('-safe');
    expect(args).toContain('0');
    expect(args).toContain('/tmp/inputs.txt');
    expect(args).toContain('copy');
    expect(args).toContain('+faststart');
  });

  it('reencodes when audio is muted', () => {
    const args = buildConcatArgs('/tmp/inputs.txt', '/out.mkv', {
      container: 'mkv',
      mode: 'copy',
      audio: 'mute',
      encoder: 'libopenh264'
    });
    expect(args).toContain('-af');
    expect(args).toContain('libopenh264');
    expect(args).not.toContain('copy');
  });

  it('removes audio in copy mode and encodes WebM exactly', () => {
    const copy = buildConcatArgs('/tmp/inputs.txt', '/out.mkv', {
      container: 'mkv',
      mode: 'copy',
      audio: 'remove'
    });
    expect(copy).toContain('-an');
    expect(copy).not.toContain('0:a:0?');

    const webm = buildConcatArgs('/tmp/inputs.txt', '/out.webm', {
      container: 'webm',
      mode: 'exact',
      audio: 'remove'
    });
    expect(webm).toContain('libvpx-vp9');
    expect(webm).toContain('-an');

    const webmWithAudio = buildConcatArgs('/tmp/inputs.txt', '/out.webm', {
      container: 'webm',
      mode: 'exact'
    });
    expect(webmWithAudio).toContain('libvpx-vp9');
    expect(webmWithAudio).not.toContain('-an');
  });

  it('reencodes concat output with the selected encoder', () => {
    const x264 = buildConcatArgs('/tmp/inputs.txt', '/out.mkv', {
      container: 'mkv',
      mode: 'exact',
      encoder: 'libx264'
    });
    expect(x264).toContain('-crf');

    const hardware = buildConcatArgs('/tmp/inputs.txt', '/out.mkv', {
      container: 'mkv',
      mode: 'exact',
      encoder: 'h264_mf'
    });
    expect(hardware).toContain('h264_mf');

    const mpeg = buildConcatArgs('/tmp/inputs.txt', '/out.mkv', {
      container: 'mkv',
      mode: 'exact',
      encoder: 'mpeg4',
      audio: 'remove'
    });
    expect(mpeg).toContain('mpeg4');
    expect(mpeg).toContain('-an');
  });
});

describe('resolveClipOutputPath', () => {
  it('does not overwrite an existing clip', async () => {
    const dir = await makeDir();
    const input = join(dir, 'movie.mp4');
    await writeFile(input, '');
    expect(resolveClipOutputPath(input, undefined, 'mp4')).toBe(join(dir, 'movie (clip).mp4'));

    await writeFile(join(dir, 'movie (clip).mp4'), '');
    expect(resolveClipOutputPath(input, undefined, 'mp4')).toBe(join(dir, 'movie (clip 2).mp4'));
  });

  it('uses the GIF extension', async () => {
    const dir = await makeDir();
    const input = join(dir, 'movie.mp4');
    await writeFile(input, '');
    expect(resolveClipOutputPath(input, undefined, 'gif')).toBe(join(dir, 'movie (clip).gif'));
  });

  it('creates a unique concat name', async () => {
    const dir = await makeDir();
    const input = join(dir, 'movie.mp4');
    await writeFile(input, '');
    expect(resolveConcatOutputPath([input], undefined, 'mp4')).toBe(
      join(dir, 'movie (concat).mp4')
    );
  });

  it('accepts a leading dot and avoids concat collisions', async () => {
    const dir = await makeDir();
    const input = join(dir, 'movie.mp4');
    await writeFile(input, '');
    expect(resolveClipOutputPath(input, dir, '.webm')).toBe(join(dir, 'movie (clip).webm'));

    await writeFile(join(dir, 'movie (concat).mp4'), '');
    expect(resolveConcatOutputPath([input], undefined, 'mp4')).toBe(
      join(dir, 'movie (concat 2).mp4')
    );
  });
});
