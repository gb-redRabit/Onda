import { detectYtKind, normalizeYtUrl } from './youtube';
import { detectScKind, normalizeScUrl } from './soundcloud';
import type { PlatformKind } from './platform';
import type { YouTubeResolveKind } from './types/online';

// Provider adapter registry — the shared seam between platforms. Each service
// exposes URL detection, kind classification, normalization and the "watch"
// URL builder. Adding a service means adding a provider here, not rewriting
// the queue, library or download views.
interface MediaProvider {
  id: string;
  canResolve(url: string): boolean;
  kind(url: string): YouTubeResolveKind | null;
  normalizeUrl(url: string, kind: YouTubeResolveKind): string;
  // Builds a canonical page URL from an item id. Returns '' when the platform
  // cannot rebuild a URL from the id alone (SoundCloud permalinks are words,
  // not numeric ids) — callers must then use the item's own `url` field.
  buildWatchUrl(videoId: string): string;
}

export const youtubeProvider: MediaProvider = {
  id: 'youtube',
  canResolve: (url) => detectYtKind(url) !== null,
  kind: (url) => detectYtKind(url),
  normalizeUrl: (url, kind) => normalizeYtUrl(url, kind),
  buildWatchUrl: (videoId) => `https://www.youtube.com/watch?v=${videoId}`
};

export const soundcloudProvider: MediaProvider = {
  id: 'soundcloud',
  canResolve: (url) => detectScKind(url) !== null,
  kind: (url): PlatformKind | null => detectScKind(url),
  normalizeUrl: (url) => normalizeScUrl(url),
  buildWatchUrl: () => ''
};

const providers: MediaProvider[] = [youtubeProvider, soundcloudProvider];

export function resolveProvider(url: string): MediaProvider | null {
  for (const provider of providers) {
    if (provider.canResolve(url)) return provider;
  }
  return null;
}

// Canonical URL builders. Views should use these instead of interpolating
// platform URLs by hand, so a scheme change is made in one place.
export function buildYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Channel URL from a `UC…` id, or a `@handle` (leading `@` optional). */
export function buildYouTubeChannelUrl(channelId: string): string {
  const id = channelId.trim();
  if (!id) return '';
  if (id.startsWith('@')) return `https://www.youtube.com/${id}`;
  return `https://www.youtube.com/channel/${encodeURIComponent(id)}`;
}

/** Channel URL from a bare `@handle` (a handle is not a channel id). */
export function buildYouTubeHandleUrl(handle: string): string {
  const h = handle.trim().replace(/^@/, '');
  return h ? `https://www.youtube.com/@${encodeURIComponent(h)}` : '';
}

/** Profile URL from a SoundCloud slug or any soundcloud.com URL. */
export function buildSoundcloudProfileUrl(profileOrUrl: string): string {
  const slug = profileOrUrl
    .trim()
    .replace(/^https?:\/\/(?:www\.)?soundcloud\.com\//i, '')
    .replace(/^@/, '')
    .split('/')
    .filter(Boolean)[0];
  return slug ? `https://soundcloud.com/${encodeURIComponent(slug)}` : '';
}
