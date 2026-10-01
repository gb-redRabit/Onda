export function isDrivePath(p: string): boolean {
  // Pusty string to widok dysków; pojedyncza litera dysku (C:) to korzeń dysku.
  return /^[A-Z]:\\?$/i.test(p) || p === '';
}

export function parentPath(p: string): string {
  if (!p || isDrivePath(p)) return '';
  const cleaned = p.replace(/[\\/]+$/, '');
  // Obsłuż zarówno separator Windows, jak i POSIX.
  const idx = Math.max(cleaned.lastIndexOf('\\'), cleaned.lastIndexOf('/'));
  if (idx < 0) return '';
  const parent = cleaned.substring(0, idx);
  // Korzeń systemu plików (POSIX): rodzicem "/foo" jest "/".
  if (!parent) return p.startsWith('/') ? '/' : '';
  if (isDrivePath(parent)) return parent;
  return parent;
}

export function formatTabLabel(path: string): string {
  return path ? path.split(/[\\/]/).filter(Boolean).pop() || path : '';
}
