import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAudioConvertArgs,
  buildVideoConvertArgs,
  resolveConvertOutputPath
} from '../media-convert';

const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'onda-tools-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('audio convert args', () => {
  it('encodes MP3 with the requested bitrate', () => {
    const args = buildAudioConvertArgs('/in.wav', '/out.mp3', 'mp3', 320);
    expect(args).toContain('libmp3lame');
    expect(args).toContain('320k');
    expect(args).toContain('-progress');
    expect(args[args.length - 1]).toBe('/out.mp3');
  });

  it('does not pass a bitrate for FLAC and uses PCM for WAV', () => {
    expect(buildAudioConvertArgs('/in.wav', '/out.flac', 'flac', 320)).not.toContain('320k');
    expect(buildAudioConvertArgs('/in.wav', '/out.wav', 'wav', 320)).toContain('pcm_s16le');
  });
});

describe('video convert args', () => {
  it('encodes MP4 with H.264 and faststart', () => {
    const args = buildVideoConvertArgs('/in.mkv', '/out.mp4', 'mp4', 'high');
    expect(args).toContain('libx264');
    expect(args).toContain('18');
    expect(args).toContain('+faststart');
  });

  it('encodes WebM with VP9 and Opus', () => {
    const args = buildVideoConvertArgs('/in.mp4', '/out.webm', 'webm', 'low');
    expect(args).toContain('libvpx-vp9');
    expect(args).toContain('libopus');
  });

  it('falls back to OpenH264 bitrate control when libx264 is unavailable', () => {
    const args = buildVideoConvertArgs('/in.mkv', '/out.mp4', 'mp4', 'high', 'libopenh264');
    expect(args).toContain('libopenh264');
    expect(args).toContain('8M');
    expect(args).not.toContain('-crf');
    expect(args).toContain('yuv420p');
  });
});

describe('resolveConvertOutputPath', () => {
  it('avoids overwriting the source and existing outputs', async () => {
    const dir = await makeDir();
    const input = join(dir, 'song.mp3');
    await writeFile(input, '');
    expect(resolveConvertOutputPath(input, undefined, '.mp3')).toBe(
      join(dir, 'song (converted).mp3')
    );

    await writeFile(join(dir, 'song (converted).mp3'), '');
    expect(resolveConvertOutputPath(input, undefined, '.mp3')).toBe(
      join(dir, 'song (converted 2).mp3')
    );
  });
});
