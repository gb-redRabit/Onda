import { formatDuration as formatDurationBase } from '../../../shared/formatDuration';
import type { IpcYoutubeVideo } from '../../../shared/types/ipc';
import type { YouTubeResolvedItem } from '../../../shared/types/online';
import { isLoopbackHost } from '../network-target';

// Czyste mappery/walidatory wpisów yt-dlp wyodrębnione z `youtube-utils.ts`
// (plan 2.8). `youtube-utils` re-eksportuje je, aby istniejące importery/testy działały
// bez zmian.

export interface YtDlpEntry {
  _type?: string;
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
  // Kanoniczny URL strony — obecny we wpisach SoundCloud (płaskie wyniki wyszukiwania to
  // wpisy URL; sam id nie odtworzy ich permalinka).
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

// yt-dlp zwraca URL-e miniatur z danych sieciowych — nigdy nie podawaj ich do <img>
// bez walidacji. Zezwalaj tylko na https i odrzucaj loopback/localhost (SSRF do
// lokalnych usług), w tym loopback IPv6.
export function isSafeThumbnailUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (isLoopbackHost(parsed.hostname)) return false;
  return true;
}

// AWATARY kanałów są zapisywane na dni (store subskrypcji), więc NIE mogą
// nieść krótkotrwałych podpisów. Nagłówki kanałów yt-dlp mieszają stabilne
// ścieżki yt3.ggpht/ytc z URL-ami lh3.googleusercontent podpisanymi przez
// ?expire=<epoch>&sig=..., które padają w ciągu ~dnia — te są tu odrzucane,
// aby martwy link nigdy nie został zapisany jako miniatura kanału.
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

// Normalizuje płaski wpis yt-dlp (wiersz playlisty/kanału lub pełne info o wideo)
// do kształtu, który renderer konsumuje dla podglądu resolve.
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

/** Mapuje ogólne wyniki yt-dlp bez wymyślania fallbackowej miniatury YouTube. */
export function mapExternalResolvedEntry(
  entry: YtDlpEntry,
  fallbackUrl: string
): YouTubeResolvedItem {
  const thumbnailCandidates = [
    entry.thumbnail,
    ...(entry.thumbnails || [])
      .sort((a, b) => (b.width || 0) - (a.width || 0))
      .map((thumbnail) => thumbnail.url)
  ];
  const thumbnail = thumbnailCandidates.find(
    (url): url is string => !!url && isSafeThumbnailUrl(url)
  );
  return {
    id: entry.id || entry.webpage_url || entry.url || fallbackUrl,
    title: entry.title || entry.id || fallbackUrl,
    duration: formatDuration(entry.duration),
    thumbnail: thumbnail || '',
    channelTitle: entry.channel || entry.uploader || '',
    channelId: entry.channel_id || entry.uploader_id || '',
    isPlayable: entry.is_playable !== false,
    url: entry.webpage_url || entry.url || fallbackUrl
  };
}

// Normalizuje wpis yt-dlp do kształtu wideo używanego przez wyszukiwanie i
// listę filmów kanału.
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

// Wybiera miniaturę awatara kanału. W przeciwieństwie do wideo, strona kanału miesza
// szerokie obrazy banerów z kwadratowymi kadrami awatara w tej samej liście `thumbnails`,
// więc zawsze preferuj kwadraty (width === height) i bierz największy z nich.
// Spada do najszerszej bezpiecznej miniatury, potem do pojedynczego stringa `thumbnail`,
// który emitują niektóre wersje yt-dlp. Kwalifikują się tylko STABILNE URL-e — podpisane
// wygasające są całkowicie pomijane (patrz isStableAvatarUrl).
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
