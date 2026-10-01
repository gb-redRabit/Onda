/**
 * Breadcrumb segments for an explorer path.
 *
 * Each entry carries the path its button navigates to, and that path is used as
 * the v-for key. The key used to be the index, so navigating from `a\b\c` to
 * `a\d` reused the button DOM of `a\b` for `a\d` — including its drag state and
 * focus. A path is unique per segment and stable while the user stays in the
 * folder, so the shared prefix keeps its nodes across a navigation.
 */
export interface BreadcrumbSegment {
  /** Folder name shown in the button. */
  part: string;
  /** Position in the segment list; the separator is drawn above index 0. */
  idx: number;
  /** Full path up to and including this segment. Unique within the list. */
  path: string;
}

export function buildSegments(currentPath: string): BreadcrumbSegment[] {
  const parts = currentPath.split('\\').filter(Boolean);
  return parts.map((part, idx) => ({ part, idx, path: parts.slice(0, idx + 1).join('\\') }));
}
