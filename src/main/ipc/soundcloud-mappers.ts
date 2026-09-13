import { formatDuration } from '../../shared/formatDuration';
import type { IpcYoutubeVideo } from '../../shared/types/ipc';

// Pure SoundCloud API shapes / mappers / validators extracted from
// `soundcloud-client.ts` (plan 2.8). `soundcloud-client` re-exports the public
// ones so existing importers keep working unchanged.

// Pulls client_id candidates out of a JS bundle.
export function extractClientIdFromBundle(js: string): string | null {
  const m = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{16,64})"/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// API shapes (only the fields we consume)

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

// The API tags every resource with `kind`; the structural fallbacks cover
// responses where it is missing (older proxy shapes).
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

// Remote images are validated like every other network-provided thumbnail:
// https only, never loopback (SSRF to local services).
export function isSafeImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  return true;
}

// SC artwork URLs end with a size token (-large.jpg, -t500x500.jpg, ...).
// Request the big square variant when possible, falling back to what we got.
export function upgradeArtworkUrl(raw: string | null | undefined): string {
  if (!raw || !isSafeImageUrl(raw)) return '';
  return raw.replace(/-large(\.(jpg|png))$/, '-t500x500$1');
}

export function scPublishedAt(created?: string): string {
  if (!created) return '';
  const date = created.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

// Maps an API track onto the shared video shape used by cards/queue/downloads.
// `url` is the permalink — mandatory for SC flows (ids cannot be rebuilt).
// NOTE: no avatar fallback for missing artwork — using the artist's avatar as
// the cover made every tile on a profile look identical.
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

// Filesystem-safe file name for a track title (http/soundcloud download jobs
// write bytes directly under this name).
export function sanitizeFileName(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex -- control chars are invalid in file names
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[.\s]+$/, '');
  return (cleaned || 'track').slice(0, 120);
}

// CloudFront-signed CDN URLs carry their own expiry inside the base64url
// `Policy` param ("DateLessThan": {"AWS:EpochTime": <secs>}) — observed
// lifetime is ~30 minutes, far shorter than any generic cache TTL, so caches
// must derive their expiry from THIS instead of a fixed duration.
export function extractSignedUrlExpiryMs(url: string): number | null {
  const m = url.match(/[?&]Policy=([^&]+)/);
  if (!m) return null;
  try {
    // latin1 keeps stray trailing bytes harmless; the epoch number is ASCII.
    const raw = Buffer.from(m[1], 'base64url').toString('latin1');
    const e = raw.match(/"AWS:EpochTime"\s*:\s*(\d+)/);
    return e ? Number(e[1]) * 1000 : null;
  } catch {
    return null;
  }
}
