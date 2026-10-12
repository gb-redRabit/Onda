import { describe, it, expect } from 'vitest';
import type { MediaFile } from '@renderer/types/media';
import { filterSmartFolder, countSmartFolder, hasCover, getSmartFolder } from '../smartFolders';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function track(over: Partial<MediaFile> = {}): MediaFile {
  const path = over.path ?? '/m/x.mp3';
  return {
    id: path,
    name: path,
    path,
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: NOW,
    playCount: 0,
    ...over
  } as MediaFile;
}

const ctx = (favorites: string[] = [], now = NOW) => ({ favorites: new Set(favorites), now });

describe('hasCover', () => {
  it('is true for a thumbnail or an embedded picture, false otherwise', () => {
    expect(hasCover(track())).toBe(false);
    expect(hasCover(track({ thumbnail: 'data:image/jpeg;base64,x' }))).toBe(true);
    expect(
      hasCover(
        track({ metadata: { picture: [{ format: 'image/jpeg', data: new Uint8Array(1) }] } })
      )
    ).toBe(true);
  });
});

describe('smart folders', () => {
  const picture = { picture: [{ format: 'image/jpeg', data: new Uint8Array(1) }] };
  const tracks = [
    track({ path: '/a', playCount: 0, addedAt: NOW - 1 * DAY, metadata: picture }),
    track({ path: '/b', playCount: 5, addedAt: NOW - 100 * DAY }),
    track({ path: '/c', playCount: 2, addedAt: NOW - 2 * DAY, metadata: { lossless: true } })
  ];

  it('unplayed = playCount 0', () => {
    expect(filterSmartFolder('unplayed', tracks, ctx()).map((t) => t.path)).toEqual(['/a']);
  });

  it('mostPlayed keeps played tracks sorted by playCount desc', () => {
    expect(filterSmartFolder('mostPlayed', tracks, ctx()).map((t) => t.path)).toEqual(['/b', '/c']);
  });

  it('noCover = no thumbnail and no embedded picture', () => {
    expect(filterSmartFolder('noCover', tracks, ctx()).map((t) => t.path)).toEqual(['/b', '/c']);
  });

  it('favorites filters by the favorites set', () => {
    expect(filterSmartFolder('favorites', tracks, ctx(['/b', '/a'])).map((t) => t.path)).toEqual([
      '/a',
      '/b'
    ]);
  });

  it('favoritesNoCover = favorite AND no cover', () => {
    expect(
      filterSmartFolder('favoritesNoCover', tracks, ctx(['/b', '/a'])).map((t) => t.path)
    ).toEqual(['/b']);
  });

  it('recent keeps tracks added within the window, newest first', () => {
    expect(filterSmartFolder('recent', tracks, ctx()).map((t) => t.path)).toEqual(['/a', '/c']);
  });

  it('lossless reads metadata.lossless', () => {
    expect(filterSmartFolder('lossless', tracks, ctx()).map((t) => t.path)).toEqual(['/c']);
  });

  it('countSmartFolder counts matches', () => {
    expect(countSmartFolder('noCover', tracks, ctx())).toBe(2);
  });

  it('only considers audio tracks (no video, no images)', () => {
    const mixed = [
      track({ path: '/song', type: 'audio', playCount: 0 }),
      track({ path: '/clip.mp4', type: 'video', playCount: 0 }),
      track({ path: '/pic.png', type: 'image', playCount: 0 })
    ];
    expect(filterSmartFolder('unplayed', mixed, ctx()).map((t) => t.path)).toEqual(['/song']);
    expect(countSmartFolder('noCover', mixed, ctx())).toBe(1);
  });

  it('unknown folder id yields no tracks', () => {
    expect(filterSmartFolder('nope' as never, tracks, ctx())).toEqual([]);
    expect(getSmartFolder('nope' as never)).toBeUndefined();
  });
});
