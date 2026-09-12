// SoundCloud internal API v2 client (SC-only module — no YouTube imports, no
// Electron). The web app authenticates every call with a `client_id` that is
// embedded in its JS bundles and rotates every few days; we extract it once,
// cache it and re-extract on 401/403. This is the same API yt-dlp drives under
// the hood — minus the process spawn — so search/resolve/stream land in
// hundreds of milliseconds instead of seconds.
import { logger } from '../../shared/logger';
import { formatDuration } from '../../shared/formatDuration';
import type { IpcYoutubeVideo } from '../../shared/types/ipc';

const SC_API_BASE = 'https://api-v2.soundcloud.com';
const SC_HOME = 'https://soundcloud.com/';
const CLIENT_ID_TTL_MS = 24 * 60 * 60 * 1000;
// After a failed extraction wait this long before probing the page again.
const CLIENT_ID_FAIL_RETRY_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_BUNDLE_PROBES = 6;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export class ScApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ScApiError';
    this.status = status;
  }
}

async function fetchText(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new ScApiError(`HTTP ${res.status}`, res.status);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) throw new ScApiError('Response too large');
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) throw new ScApiError('Response too large');
  return text;
}

interface ClientIdState {
  value: string | null;
  fetchedAt: number;
}
let clientIdState: ClientIdState = { value: null, fetchedAt: 0 };
let extractionInFlight: Promise<string | null> | null = null;

// Pulls client_id candidates out of a JS bundle.
export function extractClientIdFromBundle(js: string): string | null {
  const m = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{16,64})"/);
  return m ? m[1] : null;
}

async function extractClientId(): Promise<string | null> {
  let home: string;
  try {
    home = await fetchText(SC_HOME);
  } catch (e) {
    logger.warn('sc', 'home page fetch failed', String(e));
    return null;
  }
  // Bundles are served as absolute URLs on a-v2.sndcdn.com
  // (<script src="https://a-v2.sndcdn.com/assets/NN-x.js">), sometimes as
  // scheme-relative or root-relative paths — match every form.
  const bundleUrls = [...home.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((src) => src.includes('/assets/') && /\.js(?:[?#].*)?$/.test(src))
    .map((src) => {
      try {
        if (/^https?:\/\//i.test(src)) return src;
        if (src.startsWith('//')) return `https:${src}`;
        return new URL(src, SC_HOME).toString();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  const unique = [...new Set(bundleUrls)].slice(-MAX_BUNDLE_PROBES).reverse();
  for (const url of unique) {
    try {
      const js = await fetchText(url);
      const id = extractClientIdFromBundle(js);
      if (id) return id;
    } catch {
      // try the next bundle
    }
  }
  logger.warn('sc', 'no client_id found in bundles', String(unique.length));
  return null;
}

export async function getClientId(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh) {
    const age = now - clientIdState.fetchedAt;
    if (clientIdState.value && age < CLIENT_ID_TTL_MS) return clientIdState.value;
    // A failed extraction is retried at most once per minute so a broken page
    // layout never turns into an extraction storm on every API call.
    if (!clientIdState.value && age < CLIENT_ID_FAIL_RETRY_MS) return null;
  }
  if (!extractionInFlight) {
    extractionInFlight = extractClientId()
      .then((value) => {
        clientIdState = { value, fetchedAt: Date.now() };
        return value;
      })
      .finally(() => {
        extractionInFlight = null;
      });
  }
  return extractionInFlight;
}

export function resetClientIdCache(): void {
  clientIdState = { value: null, fetchedAt: 0 };
}

type ScParamValue = string | number | boolean | undefined | null;

async function scApi<T>(path: string, params: Record<string, ScParamValue>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const clientId = await getClientId(attempt > 0);
    if (!clientId) throw new ScApiError('SoundCloud client_id unavailable');
    const url = new URL(`${SC_API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('app_locale', 'en');
    let body: string;
    try {
      body = await fetchText(url.toString());
    } catch (e) {
      const status = e instanceof ScApiError ? e.status : undefined;
      // Rotated/expired client_id — refresh once and retry.
      if ((status === 401 || status === 403) && attempt === 0) continue;
      throw e;
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ScApiError('Invalid JSON from SoundCloud API');
    }
  }
  throw new ScApiError('SoundCloud API unavailable');
}

// ---------------------------------------------------------------------------
// API shapes (only the fields we consume)

interface ScApiUser {
  id?: number;
  permalink?: string;
  username?: string;
  avatar_url?: string | null;
  followers_count?: number;
  track_count?: number;
  description?: string | null;
}

interface ScApiTranscoding {
  url?: string;
  format?: { protocol?: string; mime_type?: string };
}

interface ScApiTrack {
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

interface ScApiPlaylist {
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

type ScApiResource = ScApiTrack | ScApiPlaylist | ScApiUser | { kind?: string };

// The API tags every resource with `kind`; the structural fallbacks cover
// responses where it is missing (older proxy shapes).
function isTrack(r: ScApiResource): r is ScApiTrack {
  if ((r as { kind?: string }).kind) return (r as { kind?: string }).kind === 'track';
  const t = r as ScApiTrack;
  return t.media?.transcodings !== undefined && !('track_count' in r);
}
function isPlaylist(r: ScApiResource): r is ScApiPlaylist {
  if ((r as { kind?: string }).kind) return (r as { kind?: string }).kind === 'playlist';
  const p = r as ScApiPlaylist;
  return p.track_count !== undefined || Array.isArray(p.tracks);
}
function isUser(r: ScApiResource): r is ScApiUser {
  if ((r as { kind?: string }).kind) return (r as { kind?: string }).kind === 'user';
  const u = r as ScApiUser;
  return typeof u.username === 'string' && u.followers_count !== undefined;
}

// Remote images are validated like every other network-provided thumbnail:
// https only, never loopback (SSRF to local services).
function isSafeImageUrl(url: string): boolean {
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

function scPublishedAt(created?: string): string {
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

// ---------------------------------------------------------------------------
// Public endpoint wrappers

export async function scSearchTracks(
  query: string,
  limit = 100,
  offset = 0
): Promise<IpcYoutubeVideo[]> {
  const res = await scApi<{ collection?: ScApiTrack[] }>('/search/tracks', {
    q: query,
    limit,
    offset
  });
  return (res.collection || []).filter((t) => t.id != null && t.title).map((t) => mapScTrack(t));
}

export type ScResolved =
  | { kind: 'track'; track: ScApiTrack }
  | { kind: 'playlist'; playlist: ScApiPlaylist }
  | { kind: 'user'; user: ScApiUser };

// Resolves any SC URL (including on.soundcloud.com / snd.sc short links) to a
// typed resource.
export async function scResolve(url: string): Promise<ScResolved> {
  const resource = await scApi<ScApiResource>('/resolve', { url });
  if (!resource || typeof resource !== 'object') throw new ScApiError('Empty resolve result');
  if (isTrack(resource)) return { kind: 'track', track: resource };
  if (isPlaylist(resource)) return { kind: 'playlist', playlist: resource };
  if (isUser(resource)) return { kind: 'user', user: resource };
  throw new ScApiError('Unsupported SoundCloud resource');
}

export async function scUserTracks(
  userId: number,
  limit: number,
  offset: number
): Promise<{ items: IpcYoutubeVideo[]; total: number | null }> {
  // Default (full) representation keeps artwork_url and media.transcodings.
  const res = await scApi<{ collection?: ScApiTrack[] }>(`/users/${userId}/tracks`, {
    limit,
    offset
  });
  const items = (res.collection || [])
    .filter((t) => t.id != null && t.title)
    .map((t) => mapScTrack(t));
  return { items, total: null };
}

export interface ScProfileSnapshot {
  channel: {
    id: string;
    url: string;
    title: string;
    thumbnail: string;
    followerCount?: number;
    trackCount?: number;
    description?: string;
  };
  // Profile tracks, newest first — same ordering contract as yt-dlp
  // --flat-playlist, so the subscription diff logic works unchanged.
  items: IpcYoutubeVideo[];
}

// Loads a profile's metadata and up to `cap` newest tracks in 200-item pages.
// Used by "browse whole profile" and the subscription checker (one logical
// call instead of many paginated ones).
export async function scProfileSnapshot(profileUrl: string, cap = 300): Promise<ScProfileSnapshot> {
  const resource = await scResolve(profileUrl);
  if (resource.kind !== 'user') throw new ScApiError('Not a SoundCloud profile');
  const user = resource.user;
  if (user.id == null) throw new ScApiError('Profile without id');
  const permalink = user.permalink ? `https://soundcloud.com/${user.permalink}` : profileUrl;
  const collected: IpcYoutubeVideo[] = [];
  const pageSize = 200;
  for (let offset = 0; offset < cap; offset += pageSize) {
    const page = await scUserTracks(user.id, Math.min(pageSize, cap - offset), offset);
    collected.push(...page.items);
    if (page.items.length < pageSize) break;
  }
  return {
    channel: {
      id: user.permalink || String(user.id),
      url: permalink,
      title: user.username || '',
      thumbnail: upgradeArtworkUrl(user.avatar_url),
      followerCount: user.followers_count,
      trackCount: user.track_count ?? collected.length,
      description: typeof user.description === 'string' ? user.description : ''
    },
    items: collected
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

// Playlist tracks, newest-first page window, sliced from the FULL playlist
// object (/playlists/{id}?representation=full embeds every track with
// media/artwork). NOTE: the dedicated /playlists/{id}/tracks endpoint returns
// 404 without OAuth (verified across old AND new sets), so it is not used.
export async function scPlaylistTracks(
  playlistId: number,
  limit: number,
  offset: number
): Promise<{ items: IpcYoutubeVideo[] }> {
  const full = await scApi<ScApiPlaylist>(`/playlists/${playlistId}`, {
    representation: 'full'
  });
  const all = (full.tracks || []).filter((t) => t.id != null && t.title);
  return {
    items: all.slice(offset, offset + limit).map((t) => mapScTrack(t))
  };
}

// Picks the progressive MP3 transcoding and exchanges it for a direct CDN
// URL. HLS transcodings are ignored on purpose — Chromium <audio> cannot play
// m3u8 without hls.js.
// Accepts a track permalink URL or a BARE NUMERIC TRACK ID (legacy saved
// entries store no permalink; /tracks/{id} resolves them directly).
export async function scTrackStreamUrl(
  trackUrlOrResource: string | ScApiTrack
): Promise<{ url: string } | null> {
  let track: ScApiTrack;
  if (typeof trackUrlOrResource === 'string' && /^\d+$/.test(trackUrlOrResource.trim())) {
    const fetched = await scApi<ScApiTrack>(`/tracks/${trackUrlOrResource.trim()}`, {});
    if (!fetched || fetched.id == null) return null;
    track = fetched;
  } else if (typeof trackUrlOrResource === 'string') {
    const resolved = await scResolve(trackUrlOrResource);
    if (resolved.kind !== 'track') return null;
    track = resolved.track;
  } else {
    track = trackUrlOrResource;
  }
  const progressive = (track.media?.transcodings || []).find(
    (t) => t.format?.protocol === 'progressive' && t.format?.mime_type?.startsWith('audio/')
  );
  if (!progressive?.url) return null;
  const clientId = await getClientId();
  if (!clientId) return null;
  const exchangeUrl = new URL(progressive.url);
  exchangeUrl.searchParams.set('client_id', clientId);
  const payload = JSON.parse(await fetchText(exchangeUrl.toString())) as { url?: string };
  if (!payload.url || !/^https:\/\//i.test(payload.url)) return null;
  return { url: payload.url };
}

// Fresh direct MP3 URL for a download attempt. Called at ATTEMPT start by the
// download manager so retries always get an unexpired signed URL.
export async function resolveScDownloadSource(trackUrl: string): Promise<string> {
  const stream = await scTrackStreamUrl(trackUrl);
  if (!stream) throw new ScApiError('No progressive audio available for this track');
  return stream.url;
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
