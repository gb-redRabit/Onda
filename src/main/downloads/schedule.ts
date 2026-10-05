// Harmonogram nocny: pobierania startują tylko w skonfigurowanym oknie godzinowym.
// `start === end` oznacza "zawsze dozwolone". Okno przechodzące przez północ (np. 22→6)
// obejmuje [start, 24) ∪ [0, end).
export function isWithinWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

// Milisekundy do najbliższego początku okna nocnego (czas lokalny). Używane do
// ponownego wywołania pump() dokładnie w momencie otwarcia okna — bez tego
// zadania dodane poza oknem wisiały w `pending` aż do niezwiązanego zdarzenia.
// `start === end` oznacza "zawsze dozwolone" i zwraca 0.
export function msUntilWindowStart(start: number, end: number, now: Date = new Date()): number {
  if (start === end) return 0;
  const target = new Date(now);
  target.setHours(start, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}
