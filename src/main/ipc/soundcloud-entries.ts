import { formatDuration as formatDurationBase } from '../../shared/formatDuration';
import type { IpcYoutubeVideo } from '../../shared/types/ipc';
import type { YtDlpEntry } from './youtube-mappers';

// Pure yt-dlp-entry mappers extracted from `soundcloud-handlers.ts` (plan 2.8).
// `soundcloud-handlers` re-exports `scVideoFromEntry` so existing importers keep
// working unchanged.

// Duration text from SC's millisecond field (yt-dlp reports seconds).
export function durMs(ms?: number): string | undefined {
  return durSec(ms != null ? Math.round(ms / 1000) : undefined);
}

export function durSec(seconds?: number): string | undefined {
  const text = formatDurationBase(seconds, '');
  return text === '' ? undefined : text;
}

// Thumbnail picker for yt-dlp SC entries — like the YouTube one but WITHOUT
// the i.ytimg.com fallback (a numeric SC id would produce a dead link).
export function scThumbFromEntry(entry: YtDlpEntry): string {
  const thumbs = (entry.thumbnails || []).filter((t) => t.url && /^https:\/\//i.test(t.url));
  if (thumbs.length) {
    const best = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best?.url) return best.url;
  }
  return entry.thumbnail && /^https:\/\//i.test(entry.thumbnail) ? entry.thumbnail : '';
}

// Canonical page URL of a yt-dlp entry — flat search results are URL entries.
export function entryUrl(entry: YtDlpEntry): string {
  if (entry.webpage_url && /^https:\/\//i.test(entry.webpage_url)) return entry.webpage_url;
  if (entry.url && /^https:\/\//i.test(entry.url)) return entry.url;
  if (entry.id && /^https:\/\//i.test(entry.id)) return entry.id;
  return '';
}

// Maps a yt-dlp SoundCloud entry onto the shared video-card shape.
export function scVideoFromEntry(entry: YtDlpEntry): IpcYoutubeVideo {
  return {
    id: entry.id || entryUrl(entry),
    title: entry.title || '',
    description: entry.description || '',
    thumbnail: scThumbFromEntry(entry),
    channelTitle: entry.channel || entry.uploader || '',
    channelId: entry.uploader_id || '',
    duration: durSec(entry.duration),
    viewCount: entry.view_count != null ? String(entry.view_count) : undefined,
    publishedAt: '',
    url: entryUrl(entry)
  };
}
