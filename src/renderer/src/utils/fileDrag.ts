export function beginFileDrag(e: DragEvent, paths: string[]): void {
  if (!e.dataTransfer) return;
  const list = paths.join('\n');
  e.dataTransfer.setData('text/plain', list);
  const uris = paths.map((p) => 'file:///' + p.replace(/\\/g, '/')).join('\n');
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
        if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
        p = p.replace(/\//g, '\\');
        if (p && !out.includes(p)) out.push(p);
      }
    } catch {
      /* ignore malformed uri */
    }
  }
  for (const f of Array.from(dt.files || [])) {
    const p = window.api?.getFilePath(f);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}
