import { describe, expect, it } from 'vitest';
import type { MediaFile } from '@renderer/types/media';
import { omitKey, snapshotTrack, validateShortcut } from '../plugins-helpers';

function track(overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: 'a',
    name: 'File name',
    path: '/music/a.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0,
    ...overrides
  } as MediaFile;
}

describe('omitKey', () => {
  it('returns a copy without mutating the source', () => {
    const source = { a: 1, b: 2 };
    expect(omitKey(source, 'a')).toEqual({ b: 2 });
    expect(source).toEqual({ a: 1, b: 2 });
    expect(omitKey(source, 'missing')).toEqual({ a: 1, b: 2 });
  });
});

describe('snapshotTrack', () => {
  it('returns null without a track', () => {
    expect(snapshotTrack(null)).toBeNull();
  });

  it('prefers metadata and flags streams', () => {
    const snapshot = snapshotTrack(
      track({
        type: 'stream',
        metadata: {
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          duration: 120
        }
      } as Partial<MediaFile>)
    );

    expect(snapshot).toEqual({
      id: 'a',
      path: '/music/a.mp3',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      duration: 120,
      isOnline: true
    });
  });

  it('falls back to the file name and plain duration', () => {
    const snapshot = snapshotTrack(track({ duration: 42 }));

    expect(snapshot).toMatchObject({ title: 'File name', duration: 42, isOnline: false });
  });
});

describe('validateShortcut', () => {
  it('accepts empty shortcuts and valid combinations', () => {
    expect(validateShortcut(undefined)).toBe(true);
    expect(validateShortcut('')).toBe(true);
    expect(validateShortcut('Ctrl+Shift+A')).toBe(true);
    expect(validateShortcut(' Meta + F5 ')).toBe(true);
  });

  it('rejects single keys and unknown modifiers', () => {
    expect(validateShortcut('A')).toBe(false);
    expect(validateShortcut('Command+A')).toBe(false);
    expect(validateShortcut('Ctrl+')).toBe(false);
  });

  it('rejects duplicate modifiers', () => {
    expect(validateShortcut('Ctrl+Ctrl+A')).toBe(false);
  });
});
