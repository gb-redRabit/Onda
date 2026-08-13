import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeDownloadManifest, manifestPathFor } from '../manifest';

describe('manifestPathFor', () => {
  it('derives the manifest path from the media file', () => {
    expect(manifestPathFor(join('music', 'Song.mp3'))).toBe(join('music', 'Song.onda.json'));
    expect(manifestPathFor(join('music', 'Song.flac'))).toBe(join('music', 'Song.onda.json'));
  });
});

describe('writeDownloadManifest', () => {
  it('writes a manifest with url and download date', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-manifest-'));
    try {
      const media = join(dir, 'Song.mp3');
      const p = await writeDownloadManifest(media, {
        url: 'https://www.youtube.com/watch?v=abc',
        videoId: 'abc',
        title: 'Song',
        downloadedAt: 1700000000000
      });
      expect(p).toBe(join(dir, 'Song.onda.json'));
      const parsed = JSON.parse(await readFile(p as string, 'utf-8'));
      expect(parsed.url).toBe('https://www.youtube.com/watch?v=abc');
      expect(parsed.videoId).toBe('abc');
      expect(parsed.downloadedAt).toBe(1700000000000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
