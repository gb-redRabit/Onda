/**
 * Nazwa wyświetlana dla ścieżki folderu: ostatni niepusty segment, albo `fallback`
 * gdy nie ma ścieżki (widok dysków "Ten komputer"). Dzielone po obu separatorach,
 * więc ścieżka przechwycona na jednej platformie nadal nazywa się na innej.
 */
export function explorerWindowTitle(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}
