/**
 * Fisher–Yates. Zwraca NOWĄ tablicę (nie mutuje wejścia), więc bezpiecznie używać jej
 * na computed/store refach. `rng` jest wstrzykiwany dla testów deterministycznych.
 */
export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
