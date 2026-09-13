import type { SourceItem } from '@renderer/types/sources';

// Pure helpers extracted from `views/SourcesView.vue` (plan 2.8).

export type SourceSortMode = 'none' | 'titleAsc' | 'titleDesc' | 'type';

// One `key=value` per line; blank/malformed lines are ignored.
export function parseQueryLines(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

export function filterAndSortSourceItems(
  items: SourceItem[],
  filterText: string,
  sortMode: SourceSortMode
): SourceItem[] {
  let list = items;
  const f = filterText.trim().toLowerCase();
  if (f) {
    list = list.filter(
      (i) =>
        (i.title || '').toLowerCase().includes(f) || (i.subtitle || '').toLowerCase().includes(f)
    );
  }
  if (sortMode === 'titleAsc') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  else if (sortMode === 'titleDesc')
    list = [...list].sort((a, b) => b.title.localeCompare(a.title));
  else if (sortMode === 'type') list = [...list].sort((a, b) => a.type.localeCompare(b.type));
  return list;
}
