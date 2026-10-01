/**
 * Display name for a folder path: the last non-empty segment, or `fallback`
 * when there is no path (the "This PC" drives view). Split on both separators
 * so a path captured on one platform still names itself on another.
 */
export function explorerWindowTitle(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}
