export interface SearchIndexEntry<T> {
  item: T;
  normalizedText: string;
}

interface SearchableTrack {
  name: string;
  path: string;
  metadata?: { title?: string; artist?: string; album?: string };
}

/** The single field set every library search matches: name, path and metadata. */
export function searchableTerms(track: SearchableTrack): Array<string | undefined> {
  return [
    track.name,
    track.path,
    track.metadata?.title,
    track.metadata?.artist,
    track.metadata?.album
  ];
}

/** True when a track matches the query on any searchable field (empty = match). */
export function trackMatchesQuery(track: SearchableTrack, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return searchableTerms(track).some((term) => !!term && term.toLowerCase().includes(q));
}

export function buildSearchIndex<T>(
  items: readonly T[],
  getTerms: (item: T) => readonly (string | undefined)[]
): SearchIndexEntry<T>[] {
  return items.map((item) => ({
    item,
    normalizedText: getTerms(item)
      .filter((term): term is string => !!term)
      .join('\n')
      .toLowerCase()
  }));
}

export function filterSearchIndex<T>(index: readonly SearchIndexEntry<T>[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  return index
    .filter((entry) => !normalized || entry.normalizedText.includes(normalized))
    .map((entry) => entry.item);
}
