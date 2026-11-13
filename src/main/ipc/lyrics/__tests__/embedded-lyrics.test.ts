import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ILyricsTag } from 'music-metadata';

// Embedded lyrics: SYLT/LRC/text tags are mapped locally, and any metadata failure
// degrades to "no embedded lyrics" instead of failing the request.

const h = vi.hoisted(() => ({
  parseFile: vi.fn(),
  loadMusicMetadata: vi.fn()
}));

vi.mock('../../../utils/lazy-music-metadata', () => ({
  loadMusicMetadata: h.loadMusicMetadata
}));

import { mapEmbeddedLyrics, readEmbeddedLyrics } from '../embedded-lyrics';

function tag(overrides: Partial<ILyricsTag>): ILyricsTag {
  return {
    contentType: 1,
    timeStampFormat: 2,
    syncText: [],
    ...overrides
  } as ILyricsTag;
}

beforeEach(() => {
  h.parseFile.mockReset();
  h.loadMusicMetadata.mockReset().mockResolvedValue({ parseFile: h.parseFile });
});

describe('mapEmbeddedLyrics', () => {
  it('prefers synchronized SYLT entries', () => {
    const result = mapEmbeddedLyrics([
      tag({ text: 'plain' }),
      tag({
        syncText: [
          { text: 'second', timestamp: 2000 },
          { text: 'first', timestamp: 1000 }
        ]
      })
    ]);

    expect(result).toEqual({
      kind: 'synced',
      source: 'tag',
      lines: [
        { timeMs: 1000, text: 'first' },
        { timeMs: 2000, text: 'second' }
      ]
    });
  });

  it('clamps negative timestamps and skips blank synchronized lines', () => {
    const result = mapEmbeddedLyrics([
      tag({
        syncText: [
          { text: '   ', timestamp: 500 },
          { text: 'late', timestamp: -20 }
        ]
      })
    ]);

    expect(result).toEqual({
      kind: 'synced',
      source: 'tag',
      lines: [{ timeMs: 0, text: 'late' }]
    });
  });

  it('parses LRC stored in an unsynchronized tag', () => {
    const result = mapEmbeddedLyrics([tag({ text: '[00:01.00]Hello' })]);
    expect(result).toEqual({
      kind: 'synced',
      source: 'tag',
      lines: [{ timeMs: 1000, text: 'Hello' }]
    });
  });

  it('returns plain text when the tag has no timestamps', () => {
    const result = mapEmbeddedLyrics([tag({ text: 'Hello\nWorld' })]);
    expect(result).toEqual({
      kind: 'plain',
      source: 'tag',
      lines: [
        { timeMs: 0, text: 'Hello' },
        { timeMs: 0, text: 'World' }
      ]
    });
  });

  it('returns null without usable tags', () => {
    expect(mapEmbeddedLyrics(undefined)).toBe(null);
    expect(mapEmbeddedLyrics([])).toBe(null);
    expect(mapEmbeddedLyrics([tag({ text: '   ' })])).toBe(null);
    expect(mapEmbeddedLyrics([tag({ text: undefined })])).toBe(null);
  });

  it('tolerates tags without syncText and entries without timestamps', () => {
    expect(mapEmbeddedLyrics([tag({ syncText: undefined })])).toBe(null);

    expect(mapEmbeddedLyrics([tag({ syncText: [{ text: 'now' }] as never })])).toEqual({
      kind: 'synced',
      source: 'tag',
      lines: [{ timeMs: 0, text: 'now' }]
    });
  });

  it('ignores text tags that contain only metadata', () => {
    expect(mapEmbeddedLyrics([tag({ text: '[ar:Artist]' })])).toBe(null);
  });
});

describe('readEmbeddedLyrics', () => {
  it('parses tags from the file and skips covers', async () => {
    h.parseFile.mockResolvedValue({ common: { lyrics: [tag({ text: '[00:02.00]Hi' })] } });

    await expect(readEmbeddedLyrics('/music/a.mp3')).resolves.toEqual({
      kind: 'synced',
      source: 'tag',
      lines: [{ timeMs: 2000, text: 'Hi' }]
    });
    expect(h.parseFile).toHaveBeenCalledWith('/music/a.mp3', {
      duration: false,
      skipCovers: true
    });
  });

  it('returns null when the file has no lyrics tag', async () => {
    h.parseFile.mockResolvedValue({ common: {} });

    await expect(readEmbeddedLyrics('/music/a.mp3')).resolves.toBeNull();
  });

  it('returns null when the file cannot be parsed', async () => {
    h.parseFile.mockRejectedValue(new Error('unsupported format'));

    await expect(readEmbeddedLyrics('/music/a.bin')).resolves.toBeNull();
  });

  it('returns null when music-metadata cannot be loaded', async () => {
    h.loadMusicMetadata.mockRejectedValue(new Error('missing dependency'));

    await expect(readEmbeddedLyrics('/music/a.mp3')).resolves.toBeNull();
  });
});
