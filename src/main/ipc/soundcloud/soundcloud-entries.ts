import { formatDuration as formatDurationBase } from '../../../shared/formatDuration';
import type { IpcYoutubeVideo } from '../../../shared/types/ipc';
import type { YtDlpEntry } from '../youtube/youtube-mappers';

// Czyste mappery wpisów yt-dlp wyodrębnione z `soundcloud-handlers.ts` (plan 2.8).
// `soundcloud-handlers` re-eksportuje `scVideoFromEntry`, aby istniejące importery działały
// bez zmian.

// Tekst czasu trwania z pola milisekund SC (yt-dlp raportuje sekundy).
export function durMs(ms?: number): string | undefined {
  return durSec(ms != null ? Math.round(ms / 1000) : undefined);
}

export function durSec(seconds?: number): string | undefined {
  const text = formatDurationBase(seconds, '');
  return text === '' ? undefined : text;
}

// Wybór miniatury dla wpisów SC z yt-dlp — jak ten dla YouTube, ale BEZ
// fallbacku i.ytimg.com (numeryczny id SC dałby martwy link).
export function scThumbFromEntry(entry: YtDlpEntry): string {
  const thumbs = (entry.thumbnails || []).filter((t) => t.url && /^https:\/\//i.test(t.url));
  if (thumbs.length) {
    const best = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (best?.url) return best.url;
  }
  return entry.thumbnail && /^https:\/\//i.test(entry.thumbnail) ? entry.thumbnail : '';
}

// Kanoniczny URL strony wpisu yt-dlp — płaskie wyniki wyszukiwania to wpisy URL.
export function entryUrl(entry: YtDlpEntry): string {
  if (entry.webpage_url && /^https:\/\//i.test(entry.webpage_url)) return entry.webpage_url;
  if (entry.url && /^https:\/\//i.test(entry.url)) return entry.url;
  if (entry.id && /^https:\/\//i.test(entry.id)) return entry.id;
  return '';
}

// Mapuje wpis SoundCloud z yt-dlp na wspólny kształt karty wideo.
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
