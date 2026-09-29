export interface SearchIndexEntry<T> {
  item: T;
  normalizedText: string;
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
