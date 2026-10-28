export function filePathToUri(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  // POSIX: /Users/... -> file:///Users/...; Windows: C:/... -> file:///C:/...
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

export function beginFileDrag(e: DragEvent, paths: string[]): void {
  if (!e.dataTransfer) return;
  const list = paths.join('\n');
  e.dataTransfer.setData('text/plain', list);
  const uris = paths.map(filePathToUri).join('\n');
  e.dataTransfer.setData('text/uri-list', uris);
  e.dataTransfer.effectAllowed = 'all';
}

export function getDroppedFilePaths(dt: DataTransfer | null): string[] {
  const out: string[] = [];
  if (!dt) return out;
  const uriList = dt.getData('text/uri-list') || '';
  for (const line of uriList.split('\n')) {
    const u = line.trim();
    if (!u || u.startsWith('#')) continue;
    try {
      const url = new URL(u);
      if (url.protocol === 'file:') {
        let p: string;
        try {
          p = decodeURIComponent(url.pathname);
        } catch {
          p = url.pathname;
        }
        // Windows file URL: /C:/... -> C:\...; POSIX zostawiamy z `/`.
        if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1).replace(/\//g, '\\');
        if (p && !out.includes(p)) out.push(p);
      }
    } catch {
      /* ignoruj błędny uri */
    }
  }
  for (const f of Array.from(dt.files || [])) {
    const p = window.api?.getFilePath(f);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}
