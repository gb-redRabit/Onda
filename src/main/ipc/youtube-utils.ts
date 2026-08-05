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

export function pickThumbnail(entry: YtDlpEntry): string {
  const thumbs = (entry.thumbnails || []).filter((t) => t.url);
  if (thumbs.length) {
    const best = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best?.url) return best.url;
  }
  return entry.id ? `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg` : '';
}
