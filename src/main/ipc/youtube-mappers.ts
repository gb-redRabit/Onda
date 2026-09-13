import { formatDuration as formatDurationBase } from '../../shared/formatDuration';
import type { IpcYoutubeVideo } from '../../shared/types/ipc';
import type { YouTubeResolvedItem } from '../../renderer/src/types/online';

// Pure yt-dlp entry mappers/validators extracted from `youtube-utils.ts`
// (plan 2.8). `youtube-utils` re-exports them so existing importers/tests keep
// working unchanged.

export interface YtDlpEntry {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  view_count?: number;
  channel?: string;
  channel_id?: string;
  uploader?: string;
  uploader_id?: string;
  upload_date?: string;
  availability?: string;
  is_playable?: boolean;
  playlist?: string;
  playlist_id?: string;
  playlist_title?: string;
  channel_follower_count?: number;
  playlist_count?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
  // Canonical page URL — present on SoundCloud entries (flat search results are
  // URL entries; the id alone cannot rebuild their permalink).
  webpage_url?: string;
  url?: string;
  entries?: YtDlpEntry[];
}

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

// Channel AVATARS get persisted for days (subscriptions store), so they must
// NOT carry short-lived signatures. yt-dlp channel headers mix stable
// yt3.ggpht/ytc paths with lh3.googleusercontent URLs signed by
// ?expire=<epoch>&sig=... which die within ~a day — those are rejected here
// so a dead link is never saved as the channel thumbnail.
export function isStableAvatarUrl(url: string): boolean {
  if (!isSafeThumbnailUrl(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (
    parsed.searchParams.has('expire') ||
    parsed.searchParams.has('sig') ||
    parsed.searchParams.has('signature')
  ) {
    return false;
  }
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

// Normalizes a flat yt-dlp entry (playlist/channel row or full video info)
// into the shape the renderer consumes for the resolve preview.
export function mapResolvedEntry(entry: YtDlpEntry): YouTubeResolvedItem {
  return {
    id: entry.id || '',
    title: entry.title || '',
    duration: formatDuration(entry.duration),
    thumbnail: pickThumbnail(entry),
    channelTitle: entry.channel || entry.uploader || '',
    channelId: entry.channel_id || '',
    isPlayable: entry.is_playable !== false
  };
}

// Normalizes a yt-dlp entry into the video shape used by search and the
// channel video list.
export function mapVideoEntry(entry: YtDlpEntry): IpcYoutubeVideo {
  return {
    id: entry.id || '',
    title: entry.title || '',
    description: entry.description || '',
    thumbnail: pickThumbnail(entry),
    channelTitle: entry.channel || entry.uploader || '',
    channelId: entry.channel_id || '',
    duration: formatDuration(entry.duration),
    viewCount: entry.view_count != null ? String(entry.view_count) : undefined,
    publishedAt: formatUploadDate(entry.upload_date)
  };
}

// Picks the channel avatar thumbnail. Unlike a video, a channel page mixes
// wide banner images with square avatar crops in the same `thumbnails` list,
// so always prefer squares (width === height) and take the largest of those.
// Falls back to the widest safe thumbnail, then to the single `thumbnail`
// string some yt-dlp versions emit. Only STABLE URLs are eligible — signed
// expiring ones are skipped entirely (see isStableAvatarUrl).
export function pickChannelThumbnail(entry: YtDlpEntry): string {
  const thumbs = (entry.thumbnails || []).filter((t) => t.url && isStableAvatarUrl(t.url));
  if (thumbs.length) {
    const avatars = thumbs.filter((t) => t.width && t.height && t.width === t.height);
    const pool = avatars.length ? avatars : thumbs;
    const best = [...pool].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best?.url) return best.url;
  }
  if (entry.thumbnail && isStableAvatarUrl(entry.thumbnail)) {
    return entry.thumbnail;
  }
  return '';
}

// Wyciąga pierwszy URL awatara kanału z HTML-a strony kanału (ytInitialData).
// yt-dlp z `--flat-playlist` bywa, że nie zwróci żadnej miniatury w headerze
// kanału — wtedy używamy tej samej strony, którą i tak parsuje yt-dlp.
export function extractAvatarUrl(html: string): string {
  const matches = html.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[^"'\\\s<>]+/g);
  if (!matches) return '';
  for (const m of matches) {
    if (isStableAvatarUrl(m)) return m;
  }
  return '';
}
