import { describe, it, expect } from 'vitest';
import { getFileTypeInfo, getMediaFileType } from '../fileTypes';
import type { MediaFile } from '@renderer/types/media';

describe('getFileTypeInfo', () => {
  it('returns music icon for audio files', () => {
    const info = getFileTypeInfo('.mp3');
    expect(info.icon).toBe('music');
    expect(info.color).toBe('#f59e0b');
    expect(info.category).toBe('audio');
  });

  it('returns film icon for video files', () => {
    const info = getFileTypeInfo('.mp4');
    expect(info.icon).toBe('film');
    expect(info.color).toBe('#3b82f6');
    expect(info.category).toBe('video');
  });

  it('returns file icon for unknown extensions', () => {
    const info = getFileTypeInfo('.xyz');
    expect(info.icon).toBe('file');
    expect(info.color).toBe('#6b7280');
    expect(info.category).toBe('unknown');
  });

  it('is case insensitive', () => {
    expect(getFileTypeInfo('.MP3').icon).toBe('music');
    expect(getFileTypeInfo('.FLAC').icon).toBe('music');
  });
});

describe('getMediaFileType', () => {
  function makeFile(ext: string): MediaFile {
    return {
      id: `test-${ext}`,
      path: `/test/file${ext}`,
      name: `file${ext}`,
      extension: ext,
      mimeType: 'audio/mpeg',
      size: 1000,
      addedAt: Date.now(),
      playCount: 0,
      type: ext.startsWith('.mp') ? 'audio' : 'unknown'
    };
  }

  it('returns audio for audio extensions', () => {
    for (const ext of ['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.wma', '.opus', '.aiff']) {
      expect(getMediaFileType(makeFile(ext))).toBe('audio');
    }
  });

  it('returns video for video extensions', () => {
    for (const ext of ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v']) {
      expect(getMediaFileType(makeFile(ext))).toBe('video');
    }
  });

  it('returns unknown for other extensions', () => {
    expect(getMediaFileType(makeFile('.pdf'))).toBe('unknown');
    expect(getMediaFileType(makeFile('.txt'))).toBe('unknown');
  });

  it('returns unknown for missing extension', () => {
    const f = makeFile('.txt');
    f.extension = '';
    expect(getMediaFileType(f)).toBe('unknown');
  });

  it('throws for null extension', () => {
    const f = makeFile('.txt');
    (f as any).extension = null;
    expect(() => getMediaFileType(f)).toThrow();
  });
});

describe('getFileTypeInfo additional categories', () => {
  it('returns playlist info for m3u files', () => {
    const info = getFileTypeInfo('.m3u');
    expect(info.icon).toBe('list-music');
    expect(info.color).toBe('#10b981');
    expect(info.category).toBe('playlist');
  });

  it('returns playlist info for m3u8 files', () => {
    const info = getFileTypeInfo('.m3u8');
    expect(info.icon).toBe('list-music');
    expect(info.category).toBe('playlist');
  });

  it('returns subtitle info for srt files', () => {
    const info = getFileTypeInfo('.srt');
    expect(info.icon).toBe('subtitles');
    expect(info.color).toBe('#8b5cf6');
    expect(info.category).toBe('subtitle');
  });

  it('returns subtitle info for vtt files', () => {
    const info = getFileTypeInfo('.vtt');
    expect(info.icon).toBe('subtitles');
    expect(info.category).toBe('subtitle');
  });

  it('returns image info for jpg/png/webp/svg', () => {
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.svg']) {
      const info = getFileTypeInfo(ext);
      expect(info.icon).toBe('image');
      expect(info.color).toBe('#ec4899');
      expect(info.category).toBe('image');
    }
  });

  it('handles dot-only input', () => {
    const info = getFileTypeInfo('.');
    expect(info.icon).toBe('file');
    expect(info.category).toBe('unknown');
  });

  it('handles empty string', () => {
    const info = getFileTypeInfo('');
    expect(info.icon).toBe('file');
    expect(info.category).toBe('unknown');
  });
});
