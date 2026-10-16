// Uruchamia `fn` dla elementów z ograniczoną współbieżnością (zachowuje kolejność
// wyników). Wcześniej lokalna kopia w `library-scan.ts`; wyciągnięta, by chronić
// przed lawiną równoległych operacji sieciowych/DNS także w `sources:enqueue`.
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
