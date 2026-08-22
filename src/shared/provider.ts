import { detectYtKind, normalizeYtUrl } from './youtube';
import { detectScKind, normalizeScUrl } from './soundcloud';
import type { PlatformKind } from './platform';
import type { YouTubeResolveKind } from '../renderer/src/types/online';

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
