import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  sanitizeDirSegment,
  resolveFolderTokens,
  clampSeconds,
  normalizeCoverSpec,
  buildThumbnailArgs,
  buildSectionArgs,
  siblingCoverPath
} from '../cover-spec';

describe('sanitizeDirSegment', () => {
  it('removes invalid windows characters', () => {
    expect(sanitizeDirSegment('a<b>:c"d/e\\f|g?h*i')).toBe('a b c d e f g h i');
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizeDirSegment('  Foo   Bar  ')).toBe('Foo Bar');
  });

  it('handles dots and reserved names', () => {
    expect(sanitizeDirSegment('...')).toBe('');
    expect(sanitizeDirSegment('.')).toBe('');
    expect(sanitizeDirSegment('..')).toBe('');
  });

  it('caps length', () => {
    expect(sanitizeDirSegment('a'.repeat(300)).length).toBe(120);
  });
});

describe('resolveFolderTokens', () => {
  it('replaces channel and playlist tokens', () => {
    expect(
      resolveFolderTokens('D:/Music/{channel}/{playlist}', {
        channelTitle: 'Mr<MoM>',
        playlistTitle: 'Mix / 2024'
      })
    ).toBe('D:/Music/Mr MoM/Mix 2024');
  });

  it('drops tokens without titles', () => {
    expect(resolveFolderTokens('D:/{channel}', {})).toBe('D:/');
  });
});

describe('clampSeconds', () => {
  it('falls back for invalid values', () => {
    expect(clampSeconds(undefined, 5)).toBe(5);
    expect(clampSeconds(NaN, 5)).toBe(5);
    expect(clampSeconds(Infinity, 5)).toBe(5);
  });

  it('clamps to valid range and rounds to one decimal', () => {
    expect(clampSeconds(-3, 5)).toBe(0);
    expect(clampSeconds(12.345, 5)).toBe(12.3);
    expect(clampSeconds(1e9, 5)).toBe(86400);
  });
});

describe('normalizeCoverSpec', () => {
  it('returns undefined for garbage', () => {
    expect(normalizeCoverSpec(null)).toBeUndefined();
    expect(normalizeCoverSpec('clip')).toBeUndefined();
    expect(normalizeCoverSpec({ type: 'nope' })).toBeUndefined();
  });

  it('normalizes thumbnail', () => {
    expect(normalizeCoverSpec({ type: 'thumbnail' })).toEqual({ type: 'thumbnail' });
  });

  it('accepts the explicit none type', () => {
    expect(normalizeCoverSpec({ type: 'none' })).toEqual({ type: 'none' });
  });

  it('requires a path for custom', () => {
    expect(normalizeCoverSpec({ type: 'custom' })).toBeUndefined();
    expect(normalizeCoverSpec({ type: 'custom', customPath: '  ' })).toBeUndefined();
    expect(normalizeCoverSpec({ type: 'custom', customPath: 'C:/img.jpg' })).toEqual({
      type: 'custom',
      customPath: 'C:/img.jpg'
    });
  });

  it('clamps frame time', () => {
    expect(normalizeCoverSpec({ type: 'frame', frameTime: -1 })).toEqual({
      type: 'frame',
      frameTime: 0
    });
    expect(normalizeCoverSpec({ type: 'frame' })).toEqual({ type: 'frame', frameTime: 30 });
  });

  it('rejects clips with end <= start and defaults format to webm', () => {
    expect(normalizeCoverSpec({ type: 'clip', clipStart: 10, clipEnd: 10 })).toBeUndefined();
    expect(normalizeCoverSpec({ type: 'clip', clipStart: 10, clipEnd: 40 })).toEqual({
      type: 'clip',
      clipStart: 10,
      clipEnd: 40,
      clipFormat: 'webm'
    });
    expect(
      normalizeCoverSpec({ type: 'clip', clipStart: 0, clipEnd: 5, clipFormat: 'mp4' })
    ).toEqual({ type: 'clip', clipStart: 0, clipEnd: 5, clipFormat: 'mp4' });
  });
});

describe('yt-dlp arg builders', () => {
  it('builds thumbnail embed args', () => {
    expect(buildThumbnailArgs()).toEqual([
      '--write-thumbnail',
      '--convert-thumbnails',
      'jpg',
      '--embed-thumbnail'
    ]);
  });

  it('builds section args', () => {
    expect(buildSectionArgs(10, 40)).toEqual([
      '--download-sections',
      '*10-40',
      '--force-keyframes-at-cuts'
    ]);
  });
});

describe('siblingCoverPath', () => {
  it('replaces the extension of the audio file', () => {
    expect(siblingCoverPath(join('C:', 'Music', 'Utwór - Artysta.mp3'), 'webm')).toBe(
      join('C:', 'Music', 'Utwór - Artysta.webm')
    );
    expect(siblingCoverPath('/a/b/file.flac', 'mp4')).toBe(join('/', 'a', 'b', 'file.mp4'));
  });
});
