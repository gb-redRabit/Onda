import { useVirtualizer } from '@tanstack/vue-virtual';

export interface VirtualListOptions {
  /** Liczba wierszy — czytana reaktywnie przy każdym przeliczeniu. */
  count: () => number;
  /** Element przewijany (ref kontenera listy). */
  scrollEl: () => HTMLElement | null;
  estimateSize: () => number;
  overscan?: number;
  /** Wirtualizacja pozioma (karuzela) — inaczej pionowa (lista). */
  horizontal?: boolean;
  /** Opcjonalny własny pomiar wiersza (dla wierszy o zmiennej wysokości). */
  measureElement?: (el: Element) => number;
  /**
   * Przesunięcie początku listy względem początku zawartości kontenera (px) — dla
   * listy umieszczonej PONIŻEJ innej treści (np. nagłówka/bannera), która przewija
   * się razem z nią. Bez tego wirtualizator liczy widoczne wiersze od zera i renderuje
   * je w złym miejscu / zakresie.
   */
  scrollMargin?: () => number;
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
    horizontal: opts.horizontal ?? false,
    get scrollMargin() {
      return opts.scrollMargin ? opts.scrollMargin() : 0;
    },
    ...(opts.measureElement ? { measureElement: opts.measureElement } : {})
  });
}
