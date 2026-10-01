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
  if (!currentPath) return [];
  // Obsłuż zarówno separator Windows, jak i POSIX; ścieżka segmentu musi być
  // prawidłowym celem nawigacji na tej platformie.
  const sep = currentPath.includes('\\') ? '\\' : '/';
  const leading = currentPath.startsWith(sep) ? sep : '';
  const parts = currentPath.split(/[\\/]/).filter(Boolean);
  const segments: BreadcrumbSegment[] = [];
  let acc = '';
  parts.forEach((part, idx) => {
    acc = acc ? `${acc}${sep}${part}` : `${leading}${part}`;
    segments.push({ part, idx, path: acc });
  });
  return segments;
}
