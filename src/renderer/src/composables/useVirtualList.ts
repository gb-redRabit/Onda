import { useVirtualizer } from '@tanstack/vue-virtual';

export interface VirtualListOptions {
  /** Liczba wierszy — czytana reaktywnie przy każdym przeliczeniu. */
  count: () => number;
  /** Element przewijany (ref kontenera listy). */
  scrollEl: () => HTMLElement | null;
  estimateSize: () => number;
  overscan?: number;
  /** Opcjonalny własny pomiar wiersza (dla wierszy o zmiennej wysokości). */
  measureElement?: (el: Element) => number;
}

// Jedno miejsce konfiguracji wirtualizacji list. Wcześniej ten sam obiekt
// opcji (getter `count`, `getScrollElement`, `estimateSize`, `overscan`) był
// kopiowany w kilkunastu komponentach.
export function useVirtualList(opts: VirtualListOptions) {
  return useVirtualizer({
    get count() {
      return opts.count();
    },
    getScrollElement: opts.scrollEl,
    estimateSize: opts.estimateSize,
    overscan: opts.overscan ?? 3,
    ...(opts.measureElement ? { measureElement: opts.measureElement } : {})
  });
}
