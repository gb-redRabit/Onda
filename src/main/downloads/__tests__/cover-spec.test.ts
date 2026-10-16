import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  sanitizeDirSegment,
  resolveFolderTokens,
  clampSeconds,
  normalizeCoverSpec,
  buildThumbnailArgs,
  buildSectionArgs,
  siblingCoverPath,
  clipFormatSelector,
  clipCopiedCodecAcceptable
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
  it('caps the animated clip length to avoid unbounded ffmpeg/yt-dlp work', () => {
    expect(normalizeCoverSpec({ type: 'clip', clipStart: 0, clipEnd: 24 * 3600 })).toEqual({
      type: 'clip',
      clipStart: 0,
      clipEnd: 120,
      clipFormat: 'webm'
    });
    expect(normalizeCoverSpec({ type: 'clip', clipStart: 600, clipEnd: 100000 })).toEqual({
      type: 'clip',
      clipStart: 600,
      clipEnd: 720,
      clipFormat: 'webm'
    });
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

// Regresja: okładka-klip ma iść w najwyższej dostępnej rozdzielczości (bez limitu).
// Wcześniej selektory miały `[height<=1080]`, co ucinało klip do 1080p.
describe('clipFormatSelector', () => {
  it('has no resolution cap (highest available, incl. 4K/8K)', () => {
    for (const fmt of ['webm', 'mp4'] as const) {
      expect(clipFormatSelector(fmt)).not.toMatch(/height<=/);
    }
  });

  it('prefers natively copyable codecs for WebM (VP9/AV1)', () => {
    const sel = clipFormatSelector('webm');
    expect(sel.startsWith('bestvideo[vcodec^=vp9]')).toBe(true);
    expect(sel).toContain('bestvideo[vcodec^=av01]');
    expect(sel).toContain('bestvideo[ext=webm]');
  });

  it('prefers AV1 before H.264 for MP4 (H.264 maxes at 1080p on YouTube)', () => {
    const sel = clipFormatSelector('mp4');
    expect(sel.startsWith('bestvideo[vcodec^=av01]')).toBe(true);
    expect(sel.indexOf('av01')).toBeLessThan(sel.indexOf('avc1'));
    expect(sel).toContain('bestvideo[ext=mp4]');
  });
});

// Regresja: skopiowany strumień AV1 w MP4 nie może być re-enkodowany — Chromium go odtwarza.
describe('clipCopiedCodecAcceptable', () => {
  it('accepts H.264 and AV1 copy without re-encoding', () => {
    expect(clipCopiedCodecAcceptable('h264')).toBe(true);
    expect(clipCopiedCodecAcceptable('av01')).toBe(true);
    expect(clipCopiedCodecAcceptable('h264\n')).toBe(true);
  });

  it('rejects codecs that must be re-encoded for MP4', () => {
    expect(clipCopiedCodecAcceptable('vp9')).toBe(false);
    expect(clipCopiedCodecAcceptable('av1')).toBe(false);
    expect(clipCopiedCodecAcceptable('')).toBe(false);
  });
});
