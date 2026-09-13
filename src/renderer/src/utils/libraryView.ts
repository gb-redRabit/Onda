import type { MediaFile } from '@renderer/types/media';

// Pure library view helpers extracted from `views/LibraryView.vue` (plan 2.8):
// quick search, Spotify-like chip filters and track sorting.

export type ChipId = 'all' | 'liked' | 'recent' | 'most';
export type SortKey = 'title' | 'artist' | 'album' | 'duration' | 'added' | 'plays';
export type SortDir = 'asc' | 'desc';

export function filterLibrarySearch(tracks: MediaFile[], query: string): MediaFile[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return tracks.filter(
    (tr) =>
      tr.type !== 'image' &&
      (tr.name.toLowerCase().includes(q) ||
        tr.metadata?.title?.toLowerCase().includes(q) ||
        tr.metadata?.artist?.toLowerCase().includes(q) ||
        tr.metadata?.album?.toLowerCase().includes(q) ||
        tr.path.toLowerCase().includes(q))
  );
}

export function applyLibraryChip(
  tracks: MediaFile[],
  chip: ChipId,
  favorites: string[],
  now = Date.now()
): MediaFile[] {
  let list = tracks;
  if (chip === 'liked') {
    const fav = new Set(favorites);
    list = list.filter((tr) => fav.has(tr.path));
  } else if (chip === 'recent') {
    const cutoff = now - 30 * 24 * 3600 * 1000;
    const recent = list.filter((tr) => tr.addedAt > cutoff);
    list = recent.length >= 3 ? recent : list;
  } else if (chip === 'most') {
    list = list.filter((tr) => tr.playCount > 0);
  }
  return list;
}

export function sortLibraryTracks(
  tracks: MediaFile[],
  sortKey: SortKey,
  sortDir: SortDir
): MediaFile[] {
  const list = [...tracks];
  const dir = sortDir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    switch (sortKey) {
      case 'title':
        va = (a.metadata?.title || a.name).toLowerCase();
        vb = (b.metadata?.title || b.name).toLowerCase();
        return va.localeCompare(vb as string) * dir;
      case 'artist':
        va = (a.metadata?.artist || '').toLowerCase();
        vb = (b.metadata?.artist || '').toLowerCase();
        return (va as string).localeCompare(vb as string) * dir;
      case 'album':
        va = (a.metadata?.album || '').toLowerCase();
        vb = (b.metadata?.album || '').toLowerCase();
        return (va as string).localeCompare(vb as string) * dir;
      case 'duration':
        va = a.duration || 0;
        vb = b.duration || 0;
        return ((va as number) - (vb as number)) * dir;
      case 'added':
        va = a.addedAt || 0;
        vb = b.addedAt || 0;
        return ((va as number) - (vb as number)) * dir;
      case 'plays':
        va = a.playCount || 0;
        vb = b.playCount || 0;
        return ((va as number) - (vb as number)) * dir;
    }
    return 0;
  });
  return list;
}
