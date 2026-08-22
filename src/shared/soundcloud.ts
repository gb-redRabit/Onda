// SoundCloud-only link classification. The cross-platform dispatcher lives in
// platform.ts; this file knows nothing about YouTube. Mirrors the semantics of
// shared/youtube.ts: classify a pasted link as a track ('video'), a set
// ('playlist') or a user profile ('channel'). Short links
// (on.soundcloud.com, snd.sc) are opaque — they resolve to a single track.

export type ScKind = 'video' | 'playlist' | 'channel';

// First path segments that belong to SoundCloud site pages, not to user
// profiles — e.g. soundcloud.com/discover or soundcloud.com/terms-of-use must
// never be treated as a profile of a user named "discover".
const SC_RESERVED_SEGMENTS = new Set([
  'discover',
  'search',
  'upload',
  'you',
  'your',
  'following',
  'followers',
  'explore',
  'popular',
  'charts',
  'feed',
  'stream',
  'settings',
  'notifications',
  'messages',
  'terms-of-use',
  'terms',
  'privacy',
  'imprint',
  'legal',
  'help',
  'pages',
  'jobs',
  'press',
  'blog',
  'mobile',
  'developer',
  'logout',
  'login',
  'signup'
]);

interface ScParsedUrl {
  host: string;
  segments: string[];
}

function parseScUrl(input: string): ScParsedUrl | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'soundcloud.com' && host !== 'on.soundcloud.com' && host !== 'snd.sc') {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  return { host, segments };
}

export function isSoundcloudUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  return host === 'soundcloud.com' || host === 'on.soundcloud.com' || host === 'snd.sc';
}

// Classifies a SoundCloud URL. Bare text has no meaning here (SC ids are
// numeric and permalinks are words) — anything that is not a URL is null.
export function detectScKind(rawInput: string): ScKind | null {
  const input = rawInput.trim();
  if (!input) return null;
  const parsed = parseScUrl(input);
  if (!parsed) return null;

  // Opaque short links always point at one track.
  if (parsed.host === 'on.soundcloud.com' || parsed.host === 'snd.sc') return 'video';

  const lower = parsed.segments.map((s) => s.toLowerCase());
  // /sets/ at any depth marks a set (playlist): /<user>/sets/<name> but also
  // personalized /discover/sets/<token> links (which the API then rejects
  // with a clear "not supported" instead of being treated as junk input).
  const setIdx = lower.indexOf('sets');
  if (setIdx >= 1 && parsed.segments.length >= setIdx + 2) return 'playlist';

  const [first, second] = parsed.segments;
  if (!first || SC_RESERVED_SEGMENTS.has(first.toLowerCase())) return null;
  if (second && second.toLowerCase() === 'sets' && parsed.segments.length >= 3) return 'playlist';
  // /<user>/<track> → track; /<user> → profile.
  return parsed.segments.length === 1 ? 'channel' : 'video';
}

// SC permalinks pass through unchanged — the API (and yt-dlp fallback) resolve
// short links themselves. Kept for symmetry with normalizeYtUrl.
export function normalizeScUrl(input: string): string {
  return input.trim();
}
