import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { stripTrackPictures, toPlainTrack } from '../core-state';
import type { MediaFile } from '../types/media';

function track(partial: Partial<MediaFile> = {}): MediaFile {
  return {
    id: 'id',
    name: 'Song.mp3',
    path: 'C:/music/Song.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 123,
    type: 'audio',
    addedAt: 1,
    playCount: 0,
    ...partial
  };
}

describe('stripTrackPictures', () => {
  it('returns null for no track', () => {
    expect(stripTrackPictures(null)).toBeNull();
  });

  it('returns the same object when there is no binary cover', () => {
    const source = track({ metadata: { title: 'Song', artist: 'Artist' } });
    expect(stripTrackPictures(source)).toBe(source);
  });

  it('removes pictures without mutating the original track', () => {
    const source = track({
      metadata: {
        title: 'Song',
        picture: [{ format: 'image/jpeg', data: new Uint8Array([1, 2, 3]) }]
      }
    });
    const result = stripTrackPictures(source);

    expect(result).not.toBe(source);
    expect(result?.metadata?.picture).toBeUndefined();
    expect(result?.metadata?.title).toBe('Song');
    expect(source.metadata?.picture).toHaveLength(1);
  });
});

describe('toPlainTrack', () => {
  it('turns a reactive proxy into a structured-cloneable object', () => {
    const source = reactive(
      track({
        metadata: { title: 'Song', picture: [{ format: 'image/jpeg', data: new Uint8Array([1]) }] }
      })
    );
    const plain = toPlainTrack(source);

    expect(plain?.metadata?.title).toBe('Song');
    expect(plain?.metadata?.picture).toBeUndefined();
    expect(() => structuredClone(plain)).not.toThrow();
  });
});
