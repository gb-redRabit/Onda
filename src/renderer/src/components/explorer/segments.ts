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
  // Korzeń dysku Windows (`C:\`) to JEDEN segment „C:" nawigujący do `C:\` —
  // bez tego akumulacja dokładała wiodący separator i dawała ścieżkę „\C:".
  if (/^[A-Z]:[\\/]?$/i.test(currentPath)) {
    const drive = currentPath.slice(0, 2);
    return [{ part: drive, idx: 0, path: `${drive}\\` }];
  }
  // Obsłuż zarówno separator Windows, jak i POSIX; ścieżka segmentu musi być
  // prawidłowym celem nawigacji na tej platformie.
  const sep = currentPath.includes('\\') ? '\\' : '/';
  const leading = currentPath.startsWith(sep) ? sep : '';
  const parts = currentPath.split(/[\\/]/).filter(Boolean);
  const segments: BreadcrumbSegment[] = [];
  let acc = '';
  parts.forEach((part, idx) => {
    if (idx === 0 && /^[A-Z]:$/i.test(part)) {
      // Pierwszy segment dysku nawiguje do korzenia z separatorem (`C:\`), nie do
      // względnej ścieżki `C:` (która na Windows znaczy „bieżący katalog dysku").
      acc = `${part}${sep}`;
    } else if (acc.endsWith(sep)) {
      // `acc` to już korzeń z separatorem (`C:\`) — nie dokładaj drugiego.
      acc = `${acc}${part}`;
    } else {
      acc = acc ? `${acc}${sep}${part}` : `${leading}${part}`;
    }
    segments.push({ part, idx, path: acc });
  });
  return segments;
}
