export interface YtDlpEntry {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  view_count?: number;
  channel?: string;
  channel_id?: string;
  uploader?: string;
  upload_date?: string;
  thumbnails?: Array<{ url?: string; width?: number }>;
}

import { formatDuration as formatDurationBase } from '../../shared/formatDuration';

export function formatDuration(seconds?: number): string | undefined {
  const formatted = formatDurationBase(seconds, '');
  return formatted === '' ? undefined : formatted;
}

export function formatUploadDate(date: string | undefined): string {
  if (!date || !/^\d{8}$/.test(date)) return '';
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

// yt-dlp returns thumbnail URLs from network data — never feed them to <img>
// without validation. Allow only https and reject loopback/localhost (SSRF to
// local services) including IPv6 loopback.
function isSafeThumbnailUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  if (host.endsWith('.localhost')) return false;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  return true;
}

export function pickThumbnail(entry: YtDlpEntry): string {
  const thumbs = (entry.thumbnails || []).filter((t) => t.url && isSafeThumbnailUrl(t.url));
  if (thumbs.length) {
    const best = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best?.url) return best.url;
  }
  const fallback = entry.id ? `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg` : '';
  return isSafeThumbnailUrl(fallback) ? fallback : '';
}
