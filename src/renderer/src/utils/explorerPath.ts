export function isDrivePath(p: string): boolean {
  return /^[A-Z]:\\?$/i.test(p) || p === '';
}

export function parentPath(p: string): string {
  if (!p || isDrivePath(p)) return '';
  const cleaned = p.replace(/[\\\/]$/, '');
  const idx = cleaned.lastIndexOf('\\');
  if (idx < 0) return '';
  const parent = cleaned.substring(0, idx);
  if (isDrivePath(parent)) return parent;
  return parent;
}

export function formatTabLabel(path: string): string {
  return path ? path.split('\\').filter(Boolean).pop() || path : '';
}
