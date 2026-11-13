import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { readLyricsForFile } from '../lyrics-reader';

describe('readLyricsForFile', () => {
  it('prefers a sidecar over embedded tags', async () => {
    const readEmbedded = vi.fn();
    const result = await readLyricsForFile('/music/song.mp3', {
      findSidecar: async () => '/music/song.lrc',
      readSidecar: async () => '[00:01.00]From file',
      readEmbedded
    });

    expect(result).toEqual({
      kind: 'synced',
      source: 'sidecar',
      format: 'lrc',
      lines: [{ timeMs: 1000, text: 'From file' }]
    });
    expect(readEmbedded).not.toHaveBeenCalled();
  });

  it('parses an SRT sidecar and marks its format', async () => {
    const result = await readLyricsForFile('/music/song.mp3', {
      findSidecar: async () => '/music/song.srt',
      readSidecar: async () => '1\n00:00:02,000 --> 00:00:04,000\nFrom SRT',
      readEmbedded: async () => null
    });

    expect(result).toEqual({
      kind: 'synced',
      source: 'sidecar',
      format: 'srt',
      lines: [{ timeMs: 2000, text: 'From SRT' }]
    });
  });

  it('falls back to embedded tags when the sidecar is missing or unusable', async () => {
    const result = await readLyricsForFile('/music/song.mp3', {
      findSidecar: async () => '/music/song.lrc',
      readSidecar: async () => '',
      readEmbedded: async () => ({
        kind: 'synced',
        source: 'tag',
        lines: [{ timeMs: 2000, text: 'From tag' }]
      })
    });

    expect(result.source).toBe('tag');
    expect(result.lines[0].text).toBe('From tag');
  });

  it('falls back when the sidecar has no parsable cues', async () => {
    const readEmbedded = vi.fn(async () => null);
    const result = await readLyricsForFile('/music/song.mp3', {
      findSidecar: async () => '/music/song.lrc',
      readSidecar: async () => '[ar:Artist]',
      readEmbedded
    });

    expect(result).toEqual({ kind: 'none', lines: [] });
    expect(readEmbedded).toHaveBeenCalled();
  });

  it('returns none when neither source has lyrics', async () => {
    const result = await readLyricsForFile('/music/song.mp3', {
      findSidecar: async () => null,
      readSidecar: async () => null,
      readEmbedded: async () => null
    });

    expect(result).toEqual({ kind: 'none', lines: [] });
  });

  it('reads a real sidecar through the default deps', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-lyrics-reader-'));
    const file = join(dir, 'song.mp3');
    await writeFile(join(dir, 'song.lrc'), '[00:03.00]From disk', 'utf-8');
    await writeFile(file, 'x');
    try {
      await expect(readLyricsForFile(file)).resolves.toEqual({
        kind: 'synced',
        source: 'sidecar',
        format: 'lrc',
        lines: [{ timeMs: 3000, text: 'From disk' }]
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores an oversized sidecar and finds no lyrics', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-lyrics-reader-'));
    const file = join(dir, 'song.mp3');
    await writeFile(join(dir, 'song.lrc'), 'x'.repeat(1024 * 1024 + 1), 'utf-8');
    await writeFile(file, 'x');
    try {
      await expect(readLyricsForFile(file)).resolves.toEqual({ kind: 'none', lines: [] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
