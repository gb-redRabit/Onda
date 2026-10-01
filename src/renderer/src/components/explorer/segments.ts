/**
 * Segmenty breadcrumb dla ścieżki explorera.
 *
 * Każdy wpis niesie ścieżkę, do której nawiguje jego przycisk, i ta ścieżka jest używana jako
 * klucz v-for. Kluczem kiedyś był indeks, więc nawigacja z `a\b\c` do
 * `a\d` używała ponownie DOM przycisku `a\b` dla `a\d` — wraz z jego stanem przeciągania i
 * fokusem. Ścieżka jest unikalna dla segmentu i stabilna, dopóki użytkownik pozostaje w
 * folderze, więc współdzielony prefiks zachowuje swoje węzły podczas nawigacji.
 */
export interface BreadcrumbSegment {
  /** Nazwa folderu pokazywana w przycisku. */
  part: string;
  /** Pozycja na liście segmentów; separator jest rysowany nad indeksem 0. */
  idx: number;
  /** Pełna ścieżka do tego segmentu włącznie. Unikalna w obrębie listy. */
  path: string;
}

export function buildSegments(currentPath: string): BreadcrumbSegment[] {
  const parts = currentPath.split('\\').filter(Boolean);
  return parts.map((part, idx) => ({ part, idx, path: parts.slice(0, idx + 1).join('\\') }));
}
