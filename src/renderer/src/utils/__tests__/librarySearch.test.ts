import { describe, expect, it } from 'vitest';
import { buildSearchIndex, filterSearchIndex } from '../librarySearch';

interface Track {
  title: string;
  artist?: string;
  path: string;
}

describe('library search index', () => {
  it('matches normalized title, artist and path terms without changing result order', () => {
    const tracks: Track[] = [
      { title: 'Blue Monday', artist: 'New Order', path: 'D:/music/01.mp3' },
      { title: 'Transmission', artist: 'Joy Division', path: 'D:/music/02.mp3' }
    ];
    const index = buildSearchIndex(tracks, (track) => [track.title, track.artist, track.path]);

    expect(filterSearchIndex(index, '  NEW ORDER ')).toEqual([tracks[0]]);
    expect(filterSearchIndex(index, '02.MP3')).toEqual([tracks[1]]);
    expect(filterSearchIndex(index, '')).toEqual(tracks);
  });

  it('builds a fresh index after metadata changes', () => {
    const track: Track = { title: 'Untitled', path: '/music/track.mp3' };
    const first = buildSearchIndex([track], (item) => [item.title, item.artist, item.path]);
    track.title = 'Named track';
    const updated = buildSearchIndex([track], (item) => [item.title, item.artist, item.path]);

    expect(filterSearchIndex(first, 'named')).toEqual([]);
    expect(filterSearchIndex(updated, 'named')).toEqual([track]);
  });

  it('reuses normalized terms across repeated queries', () => {
    let reads = 0;
    const track = {
      get title() {
        reads++;
        return 'Search once';
      }
    };
    const index = buildSearchIndex([track], (item) => [item.title]);
    filterSearchIndex(index, 'search');
    filterSearchIndex(index, 'once');

    expect(reads).toBe(1);
  });

  it('benchmarks a 50k-track catalog against repeated lowercase filtering', () => {
    const tracks = Array.from({ length: 50_000 }, (_, index) => ({
      title: `Track ${index}`,
      artist: `Artist ${index % 400}`,
      path: `/library/album-${index % 500}/track-${index}.mp3`
    }));
    const queries = ['artist 12', 'album-4', 'track 499', 'track 1200', 'album-31'];

    const oldStart = performance.now();
    const oldCounts: number[] = [];
    for (const query of queries) {
      const normalized = query.toLowerCase();
      oldCounts.push(
        tracks.filter(
          (track) =>
            track.title.toLowerCase().includes(normalized) ||
            track.artist.toLowerCase().includes(normalized) ||
            track.path.toLowerCase().includes(normalized)
        ).length
      );
    }
    const oldMs = performance.now() - oldStart;

    const indexStart = performance.now();
    const index = buildSearchIndex(tracks, (track) => [track.title, track.artist, track.path]);
    const buildMs = performance.now() - indexStart;
    const searchStart = performance.now();
    const counts = queries.map((query) => filterSearchIndex(index, query).length);
    const indexedMs = performance.now() - searchStart;

    expect(counts).toEqual(oldCounts);
    console.info(
      `[library-search-bench] 50k rows, 5 queries: baseline=${oldMs.toFixed(1)}ms, index=${buildMs.toFixed(1)}ms, indexed-search=${indexedMs.toFixed(1)}ms`
    );
  });
});
