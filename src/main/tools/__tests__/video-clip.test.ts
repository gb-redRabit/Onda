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
});

describe('parseFrameRate', () => {
  it('parses rational and integer frame rates', () => {
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseFrameRate('25')).toBe(25);
    expect(parseFrameRate('0/0')).toBe(0);
    expect(parseFrameRate('')).toBe(0);
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
});
