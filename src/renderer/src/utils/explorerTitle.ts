/**
 * Tytuł okna eksploratora: pełna ścieżka bieżącego folderu, a dla widoku dysków
 * (`path` puste) `fallback`. Pełna ścieżka pozwala odróżnić w pasku zadań kilka
 * okien otwartych w folderach o tej samej nazwie (np. `Music` na dwóch dyskach).
 */
export function explorerWindowTitle(path: string | null | undefined, fallback: string): string {
  return path ? path : fallback;
}
