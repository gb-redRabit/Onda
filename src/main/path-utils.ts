// Resolve a media src (onda://, file:/// or a plain path) to a normalized filesystem path.
// Lowercased on Windows to allow case-insensitive comparisons.
export function resolveMediaPath(src: string): string {
  try {
    const decoded = decodeURIComponent(src);
    const ondaMatch = decoded.match(/^onda:\/\/\/?\?path=(.+)/i);
    if (ondaMatch?.[1]) {
      const p = decodeURIComponent(ondaMatch[1]).replace(/\//g, '\\');
      return process.platform === 'win32' ? p.toLowerCase() : p;
    }
    const fileMatch = decoded.match(/^file:\/\/\/?(.+)/i);
    if (fileMatch?.[1]) {
      const p = fileMatch[1].replace(/\//g, '\\');
      return process.platform === 'win32' ? p.toLowerCase() : p;
    }
    return process.platform === 'win32' ? decoded.toLowerCase() : decoded;
  } catch {
    return src.toLowerCase();
  }
}
