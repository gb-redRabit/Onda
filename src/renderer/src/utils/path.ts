export function isUnderPath(p: string, folder: string): boolean {
  return p === folder || p.startsWith(folder + '/') || p.startsWith(folder + '\\');
}

const INVALID_DIR_CHARS = /[\\/:*?"<>|]/g;

// Sanitizes a channel/playlist name so it can be used as a folder name on
// Windows/macOS/Linux (invalid chars, reserved device names, trailing dots).
export function sanitizeDirName(name: string): string {
  const cleaned = (name || 'channel')
    .replace(INVALID_DIR_CHARS, ' ')
    .split('')
    .map((ch) => (ch.charCodeAt(0) < 0x20 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  const final = cleaned || 'channel';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(final)) return `_${final}`;
  return final;
}

// Joins path segments preserving the separator style of the first segment.
export function joinPath(...parts: string[]): string {
  const nonEmpty = parts.filter((p) => p && p.trim());
  if (nonEmpty.length === 0) return '';
  const sep = nonEmpty.some((p) => p.includes('\\')) ? '\\' : '/';
  return nonEmpty
    .map((p, i) => {
      let s = p.replace(/[\\/]+$/g, '');
      if (i > 0) s = s.replace(/^[\\/]+/g, '');
      return s;
    })
    .join(sep);
}
