export interface HighlightSegment {
  text: string;
  match: boolean;
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Dzieli tekst na segmenty trafień/nietrafień dla podanego zapytania.
 *
 * Czysta i bez DOM/HTML: zwraca dane, które komponent renderuje jako tekst
 * (bez `v-html`), więc niezaufane metadane plików nigdy nie trafiają do parsera HTML.
 * Obsługuje wszystkie wystąpienia i znaki Unicode, przy których `toLowerCase()`
 * zmienia długość (np. `İ`) — inaczej przesunięcie cięcia byłoby błędne.
 */
export function highlightSegments(text: string, query?: string): HighlightSegment[] {
  const q = query?.trim();
  if (!q) return [{ text, match: false }];
  const re = new RegExp(q.replace(REGEX_SPECIALS, '\\$&'), 'giu');
  const out: HighlightSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined || m[0] === '') continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), match: false });
    out.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (out.length === 0) return [{ text, match: false }];
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out;
}
