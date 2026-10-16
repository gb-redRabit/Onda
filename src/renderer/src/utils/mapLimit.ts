// Uruchamia `fn` dla wszystkich elementów z ograniczoną współbieżnością (zachowuje
// kolejność wyników). Chroni zależności (np. yt-dlp/scrape) przed lawiną równoległych
// uruchomień, gdy użytkownik wklei naraz wiele linków.
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
