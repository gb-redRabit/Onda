import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanDir, filterCoverSiblingVideos } from '../library-scan';
import type { MediaFile } from '../../../renderer/src/types/media';

vi.mock('../media-handlers', () => ({
  getDuration: vi.fn(async () => 0)
}));

// audio files are parsed with music-metadata — write a minimal real MP3
// (ID3 header) so parseFile does not block the test on invalid input.
function writeMinimalMp3(path: string) {
  const id3 = Buffer.concat([
    Buffer.from('ID3'),
    Buffer.from([0x04, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00])
  ]);
  writeFileSync(path, id3);
}

describe('scanDir incremental refresh', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'onda-scan-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('drops files deleted between scans', async () => {
    const a = join(dir, 'keep.mp3');
    const b = join(dir, 'delete-me.mp3');
    writeMinimalMp3(a);
    writeMinimalMp3(b);

    const first = await scanDir(dir);
    const firstPaths = first.files.map((f) => f.path);
    expect(firstPaths).toContain(a);
    expect(firstPaths).toContain(b);

    rmSync(b);

    const second = await scanDir(dir);
    const secondPaths = second.files.map((f) => f.path);
    expect(secondPaths).toContain(a);
    expect(secondPaths).not.toContain(b);
  });

  it('picks up new files on a later scan', async () => {
    const a = join(dir, 'a.mp3');
    writeMinimalMp3(a);
    const fresh = join(dir, 'fresh.mp3');

    const first = await scanDir(dir);
    expect(first.files.map((f) => f.path)).not.toContain(fresh);

    writeMinimalMp3(fresh);
    const second = await scanDir(dir);
    const paths = second.files.map((f) => f.path);
    expect(paths).toContain(a);
    expect(paths).toContain(fresh);
  });

  it('returns zero files for an emptied folder', async () => {
    const a = join(dir, 'a.mp3');
    writeMinimalMp3(a);
    const first = await scanDir(dir);
    expect(first.files).toHaveLength(1);

    rmSync(a);
    const second = await scanDir(dir);
    expect(second.files).toHaveLength(0);
  });

  it('does not add sibling animated-cover videos as library tracks', async () => {
    const mp3 = join(dir, 'Song.mp3');
    const mp4 = join(dir, 'Song.mp4');
    const revMp4 = join(dir, 'Song_rev.mp4');
    writeMinimalMp3(mp3);
    writeFileSync(mp4, Buffer.from('fake mp4'));
    writeFileSync(revMp4, Buffer.from('fake rev mp4'));

    const result = await scanDir(dir);
    const types = result.files.map((f) => f.type);
    expect(types).toEqual(['audio']);
    expect(result.files.map((f) => f.path)).toContain(mp3);
    // cover videos are still counted so the folder-type classification stays
    // consistent, but they must never become tracks.
    expect(result.videoCount).toBe(2);
  });

  it('keeps a standalone video that has no audio sibling', async () => {
    const mp3 = join(dir, 'Song.mp3');
    const other = join(dir, 'Music Video.mp4');
    writeMinimalMp3(mp3);
    writeFileSync(other, Buffer.from('fake mp4'));

    const result = await scanDir(dir);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain(mp3);
    expect(paths).toContain(other);
  });

  it('filterCoverSiblingVideos drops twins and _rev variants, keeps standalone videos', () => {
    const f = (name: string, type: 'audio' | 'video'): MediaFile => ({
      id: name,
      name,
      path: `D:\\${name}`,
      extension: `.${type === 'audio' ? 'mp3' : 'mp4'}`,
      mimeType: '',
      size: 1,
      type,
      addedAt: 0,
      playCount: 0,
      mtime: 0
    });
    const audio = f('Song.MP3', 'audio');
    const exactTwin = f('Song.mp4', 'video');
    const revTwin = f('Song_rev.mp4', 'video');
    const standalone = f('Music Video.mp4', 'video');

    const kept = filterCoverSiblingVideos([audio, exactTwin, revTwin, standalone]);
    expect(kept.map((x) => x.name)).toEqual(['Song.MP3', 'Music Video.mp4']);
  });
});
