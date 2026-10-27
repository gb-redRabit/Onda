import { describe, expect, it } from 'vitest';
import type { ILyricsTag } from 'music-metadata';
import { mapEmbeddedLyrics } from '../embedded-lyrics';

function tag(overrides: Partial<ILyricsTag>): ILyricsTag {
  return {
    contentType: 1,
    timeStampFormat: 2,
    syncText: [],
    ...overrides
  } as ILyricsTag;
}

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
  });
});
