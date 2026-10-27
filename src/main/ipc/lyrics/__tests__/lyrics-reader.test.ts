import { describe, expect, it, vi } from 'vitest';
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

  it('returns none when neither source has lyrics', async () => {
    const result = await readLyricsForFile('/music/song.mp3', {
      findSidecar: async () => null,
      readSidecar: async () => null,
      readEmbedded: async () => null
    });

    expect(result).toEqual({ kind: 'none', lines: [] });
  });
});
