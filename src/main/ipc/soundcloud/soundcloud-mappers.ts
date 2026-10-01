import { formatDuration } from '../../../shared/formatDuration';
import type { IpcYoutubeVideo } from '../../../shared/types/ipc';
import { sanitizeFilename } from '../../../shared/text';
import { isLoopbackHost } from '../network-target';

// Czyste kształty API SoundCloud / mappery / walidatory wyodrębnione z
// `soundcloud-client.ts` (plan 2.8). `soundcloud-client` re-eksportuje publiczne
// z nich, aby istniejące importery działały bez zmian.

// Wyciąga kandydatów na client_id z bundle JS.
export function extractClientIdFromBundle(js: string): string | null {
  const m = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{16,64})"/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Kształty API (tylko pola, które konsumujemy)

export interface ScApiUser {
  id?: number;
  permalink?: string;
  username?: string;
  avatar_url?: string | null;
  followers_count?: number;
  track_count?: number;
  description?: string | null;
}

export interface ScApiTranscoding {
  url?: string;
  format?: { protocol?: string; mime_type?: string };
}

export interface ScApiTrack {
  id?: number;
  title?: string;
  description?: string | null;
  duration?: number;
  permalink_url?: string;
  artwork_url?: string | null;
  user?: ScApiUser;
  playback_count?: number;
  created_at?: string;
  media?: { transcodings?: ScApiTranscoding[] };
  policy?: string;
  streamable?: boolean;
}

export interface ScApiPlaylist {
  id?: number;
  title?: string;
  description?: string | null;
  permalink_url?: string;
  artwork_url?: string | null;
  user?: ScApiUser;
  track_count?: number;
  tracks?: ScApiTrack[];
  kind?: string;
}

export type ScApiResource = ScApiTrack | ScApiPlaylist | ScApiUser | { kind?: string };

// API taguje każdy zasób `kind`; fallbacki strukturalne obsługują
// odpowiedzi, w których go brakuje (starsze kształty proxy).
export function isTrack(r: ScApiResource): r is ScApiTrack {
  if ((r as { kind?: string }).kind) return (r as { kind?: string }).kind === 'track';
  const t = r as ScApiTrack;
  return t.media?.transcodings !== undefined && !('track_count' in r);
}
export function isPlaylist(r: ScApiResource): r is ScApiPlaylist {
  if ((r as { kind?: string }).kind) return (r as { kind?: string }).kind === 'playlist';
  const p = r as ScApiPlaylist;
  return p.track_count !== undefined || Array.isArray(p.tracks);
}
export function isUser(r: ScApiResource): r is ScApiUser {
  if ((r as { kind?: string }).kind) return (r as { kind?: string }).kind === 'user';
  const u = r as ScApiUser;
  return typeof u.username === 'string' && u.followers_count !== undefined;
}

// Zdalne obrazy są walidowane jak każda inna miniatura z sieci:
// tylko https, nigdy loopback (SSRF do lokalnych usług).
export function isSafeImageUrl(url: string): boolean {
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

// URL-e okładek SC kończą się tokenem rozmiaru (-large.jpg, -t500x500.jpg, ...).
// Żądaj dużego kwadratowego wariantu, gdy to możliwe, spadając do tego, co dostaliśmy.
export function upgradeArtworkUrl(raw: string | null | undefined): string {
  if (!raw || !isSafeImageUrl(raw)) return '';
  return raw.replace(/-large(\.(jpg|png))$/, '-t500x500$1');
}

export function scPublishedAt(created?: string): string {
  if (!created) return '';
  const date = created.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

// Mapuje utwór API na wspólny kształt wideo używany przez karty/kolejkę/pobrania.
// `url` to permalink — obowiązkowy dla przepływów SC (id nie da się odtworzyć).
// UWAGA: brak fallbacku awatara przy brakującej okładce — użycie awatara artysty jako
// okładki czyniło każdy kafelek na profilu identycznym.
export function mapScTrack(track: ScApiTrack): IpcYoutubeVideo {
  const user = track.user || {};
  return {
    id: track.id != null ? String(track.id) : '',
    title: track.title || '',
    description: typeof track.description === 'string' ? track.description : '',
    thumbnail: upgradeArtworkUrl(track.artwork_url),
    channelTitle: user.username || '',
    channelId: user.permalink || '',
    duration:
      typeof track.duration === 'number'
        ? formatDuration(Math.round(track.duration / 1000), '')
        : undefined,
    viewCount: track.playback_count != null ? String(track.playback_count) : undefined,
    publishedAt: scPublishedAt(track.created_at),
    url: track.permalink_url || ''
  };
}

// Bezpieczna dla systemu plików nazwa dla tytułu utworu (zadania pobierania http/soundcloud
// zapisują bajty bezpośrednio pod tą nazwą). Implementacja znajduje się w shared/text.
export function sanitizeFileName(title: string): string {
  return sanitizeFilename(title, { maxLength: 120, fallback: 'track' });
}

// Podpisane przez CloudFront URL-e CDN noszą własne wygaśnięcie w parametrze
// `Policy` base64url ("DateLessThan": {"AWS:EpochTime": <secs>}) — zaobserwowany
// czas życia to ~30 minut, znacznie krótszy niż ogólny TTL cache, więc cache
// muszą wyprowadzać wygaśnięcie z TEGO, a nie ze stałego czasu.
export function extractSignedUrlExpiryMs(url: string): number | null {
  const m = url.match(/[?&]Policy=([^&]+)/);
  if (!m) return null;
  try {
    // latin1 sprawia, że zbłąkane końcowe bajty są nieszkodliwe; liczba epoch jest ASCII.
    const raw = Buffer.from(m[1], 'base64url').toString('latin1');
    const e = raw.match(/"AWS:EpochTime"\s*:\s*(\d+)/);
    return e ? Number(e[1]) * 1000 : null;
  } catch {
    return null;
  }
}
