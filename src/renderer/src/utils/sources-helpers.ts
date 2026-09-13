import type { SourceItem } from '@renderer/types/sources';

// Pure source-download helpers extracted from `stores/sources.ts` (plan 2.8).

export function sanitizeName(name: string): string {
  return (
    name
      .replace(/\s*[\\/:*?"<>|]\s*/g, ' ')
      .trim()
      .slice(0, 180) || 'download'
  );
}

export function deriveFileName(item: SourceItem): string {
  const url = item.mediaUrl || item.sourceUrl || '';
  const base = sanitizeName(item.title);
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot > 0 && last.length - dot <= 10) return `${base}${last.slice(dot).toLowerCase()}`;
  } catch {
    // not a URL
  }
  const fallback =
    item.type === 'image'
      ? 'jpg'
      : item.type === 'video'
        ? 'mp4'
        : item.type === 'audio'
          ? 'mp3'
          : 'bin';
  return `${base}.${fallback}`;
}

export function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
