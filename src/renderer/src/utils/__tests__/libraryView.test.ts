import { describe, expect, it } from 'vitest';
import { applyLibraryChip, sortLibraryTracks } from '../libraryView';
import type { MediaFile } from '@renderer/types/media';

const DAY = 24 * 3600 * 1000;
const NOW = 1_700_000_000_000;

function track(id: string, overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id,
    name: `name-${id}`,
    path: `/music/${id}.mp3`,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: NOW - 60 * DAY,
    playCount: 0,
    ...overrides
  };
}

describe('applyLibraryChip', () => {
  const tracks = [
    track('liked', { metadata: { title: 'Liked' } }),
    track('recent-a', { addedAt: NOW - DAY }),
    track('recent-b', { addedAt: NOW - 2 * DAY }),
    track('recent-c', { addedAt: NOW - 3 * DAY }),
    track('played', { playCount: 4 }),
    track('old', { addedAt: NOW - 90 * DAY })
  ];

  it('returns every track for the all chip', () => {
    expect(applyLibraryChip(tracks, 'all', [])).toBe(tracks);
  });

  it('filters favourites by path', () => {
    const result = applyLibraryChip(tracks, 'liked', ['/music/liked.mp3']);

    expect(result.map((item) => item.id)).toEqual(['liked']);
  });

  it('keeps only tracks added during the last 30 days when there are at least three', () => {
    const result = applyLibraryChip(tracks, 'recent', [], NOW);

    expect(result.map((item) => item.id)).toEqual(['recent-a', 'recent-b', 'recent-c']);
  });

  it('falls back to the full list when fewer than three recent tracks exist', () => {
    const few = [track('one', { addedAt: NOW - DAY }), track('old')];

    expect(applyLibraryChip(few, 'recent', [], NOW)).toBe(few);
  });

  it('keeps only played tracks for the most chip', () => {
    expect(applyLibraryChip(tracks, 'most', []).map((item) => item.id)).toEqual(['played']);
  });
});

describe('sortLibraryTracks', () => {
  const tracks = [
    track('b', {
      metadata: { title: 'Beta', artist: 'Zed', album: 'Two' },
      duration: 200,
      addedAt: 2,
      playCount: 1
    }),
    track('a', {
      metadata: { title: 'Alpha', artist: 'Amy', album: 'One' },
      duration: 100,
      addedAt: 1,
      playCount: 5
    }),
    track('c', { name: 'Charlie', duration: 0, addedAt: 0, playCount: 0 })
  ];

  it('sorts by title with metadata fallback and is stable across directions', () => {
    expect(sortLibraryTracks(tracks, 'title', 'asc').map((item) => item.id)).toEqual([
      'a',
      'b',
      'c'
    ]);
    expect(sortLibraryTracks(tracks, 'title', 'desc').map((item) => item.id)).toEqual([
      'c',
      'b',
      'a'
    ]);
  });

  it('sorts by artist and album', () => {
    expect(sortLibraryTracks(tracks, 'artist', 'asc').map((item) => item.id)).toEqual([
      'c',
      'a',
      'b'
    ]);
    expect(sortLibraryTracks(tracks, 'album', 'desc').map((item) => item.id)).toEqual([
      'b',
      'a',
      'c'
    ]);
  });

  it('sorts numeric fields and handles missing values as zero', () => {
    expect(sortLibraryTracks(tracks, 'duration', 'asc').map((item) => item.id)).toEqual([
      'c',
      'a',
      'b'
    ]);
    expect(sortLibraryTracks(tracks, 'added', 'desc').map((item) => item.id)).toEqual([
      'b',
      'a',
      'c'
    ]);
    expect(sortLibraryTracks(tracks, 'plays', 'asc').map((item) => item.id)).toEqual([
      'c',
      'b',
      'a'
    ]);
  });

  it('does not mutate the input array', () => {
    const original = [...tracks];

    sortLibraryTracks(tracks, 'title', 'asc');

    expect(tracks).toEqual(original);
  });
});
