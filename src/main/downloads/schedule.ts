// Harmonogram nocny: pobierania startują tylko w skonfigurowanym oknie godzinowym.
// `start === end` oznacza "zawsze dozwolone". Okno przechodzące przez północ (np. 22→6)
// obejmuje [start, 24) ∪ [0, end).
export function isWithinWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
