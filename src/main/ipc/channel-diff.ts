export interface ChannelVideoRef {
  id: string;
}

export interface ChannelDiffInput<T extends ChannelVideoRef = ChannelVideoRef> {
  // Filmy kanału, od najnowszych (w kolejności zwracanej przez yt-dlp `--flat-playlist`).
  items: T[];
  downloadedVideoIds: string[];
  queuedVideoIds: string[];
  baselineVideoId?: string;
}

export interface ChannelDiffResult<T extends ChannelVideoRef = ChannelVideoRef> {
  // Filmy nowsze niż baseline (lub wszystkie, gdy nie ma baseline),
  // które nie są ani pobrane, ani w kolejce.
  newArrivals: T[];
  // Liczba filmów jeszcze niepobranych (niezależnie od stanu kolejki/baseline).
  remainingCount: number;
  // True, gdy film baseline został znaleziony na przeskanowanej liście — pozwala
  // paginowanemu skanerowi zatrzymać się wcześniej po osiągnięciu baseline.
  reachedBaseline: boolean;
}

// Rozdziela filmy kanału na "nowe", "niepobrane" i "pobrane"
// na podstawie zapisanego stanu subskrypcji. Przesłane są od najnowszych, więc "nowe"
// oznacza każdy film, który pojawia się PRZED baseline na liście.
export function computeChannelDiff<T extends ChannelVideoRef>(
  input: ChannelDiffInput<T>
): ChannelDiffResult<T> {
  const known = new Set(input.downloadedVideoIds);
  const queued = new Set(input.queuedVideoIds);
  const baselineIndex = input.baselineVideoId
    ? input.items.findIndex((i) => i.id === input.baselineVideoId)
    : -1;
  const newArrivals = input.items.filter(
    (item, idx) =>
      !known.has(item.id) && !queued.has(item.id) && (baselineIndex === -1 || idx < baselineIndex)
  );
  const remainingCount = input.items.filter((item) => !known.has(item.id)).length;
  return { newArrivals, remainingCount, reachedBaseline: baselineIndex !== -1 };
}
