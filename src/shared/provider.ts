import { detectYtKind, normalizeYtUrl } from './youtube';
import type { YouTubeResolveKind } from '../renderer/src/types/youtube';

// Provider adapter (plan §8.3). Each service exposes URL detection, kind
// classification, normalization and the "watch" URL builder. The first adapter
// is YouTube; adding a service later means adding a provider here, not rewriting
// the queue, library or download views.
interface MediaProvider {
  id: string;
  canResolve(url: string): boolean;
  kind(url: string): YouTubeResolveKind | null;
  normalizeUrl(url: string, kind: YouTubeResolveKind): string;
  buildWatchUrl(videoId: string): string;
}

export const youtubeProvider: MediaProvider = {
  id: 'youtube',
  canResolve: (url) => detectYtKind(url) !== null,
  kind: (url) => detectYtKind(url),
  normalizeUrl: (url, kind) => normalizeYtUrl(url, kind),
  buildWatchUrl: (videoId) => `https://www.youtube.com/watch?v=${videoId}`
};

const providers: MediaProvider[] = [youtubeProvider];

export function resolveProvider(url: string): MediaProvider | null {
  for (const provider of providers) {
    if (provider.canResolve(url)) return provider;
  }
  return null;
}
