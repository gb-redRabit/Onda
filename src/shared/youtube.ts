import type { YouTubeResolveKind } from '../renderer/src/types/youtube';

// Classifies a user-pasted link as a single video, a playlist or a channel.
// Accepts full URLs as well as bare keys: an 11-character video ID and a
// channel handle with (@MrMoMMusic) or without (MrMoMMusic) the leading @.
// Returns null for anything that is not a recognizable YouTube link.
export function detectYtKind(rawInput: string): YouTubeResolveKind | null {
  const input = rawInput.trim();
  if (!input) return null;

  let url: URL | null = null;
  try {
    url = new URL(input);
  } catch {
    url = null;
  }

  if (url) {
    const host = url.hostname.replace(/^(www|m|music)\./, '').toLowerCase();
    if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') {
      return null;
    }
    if (host === 'youtu.be') return 'video';
    const path = url.pathname;
    if (path.startsWith('/watch')) {
      return url.searchParams.get('list') ? 'playlist' : 'video';
    }
    if (path.startsWith('/playlist')) return 'playlist';
    const first = path.split('/').filter(Boolean)[0] || '';
    if (first.startsWith('@') || first === 'channel' || first === 'c' || first === 'user') {
      return 'channel';
    }
    if (first === 'shorts' || first === 'embed' || first === 'live') return 'video';
    return null;
  }

  // Bare 11-character video ID (base64-like alphabet).
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return 'video';
  // Channel handle with the leading @ — unambiguous. A bare name without @ is
  // treated as a search query instead, so the user opts into channels with @.
  if (/^@[A-Za-z0-9_.-]+$/.test(input)) return 'channel';
  return null;
}

// Turns a bare video ID or channel handle/name into a canonical YouTube URL
// before it is handed to yt-dlp. Full URLs pass through unchanged.
export function normalizeYtUrl(input: string, kind: YouTubeResolveKind): string {
  const trimmed = input.trim();
  if (kind === 'video' && /^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return `https://www.youtube.com/watch?v=${trimmed}`;
  }
  if (kind === 'channel' && !/^[a-z]+:\/\//i.test(trimmed)) {
    const handle = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    return `https://www.youtube.com/${handle}`;
  }
  return trimmed;
}
