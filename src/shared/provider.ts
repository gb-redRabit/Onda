import { detectYtKind, normalizeYtUrl } from './youtube';
import { detectScKind, normalizeScUrl } from './soundcloud';
import type { PlatformKind } from './platform';
import type { YouTubeResolveKind } from './types/online';

// Rejestr adapterów dostawców — współdzielona granica między platformami. Każda
// usługa udostępnia wykrywanie URL, klasyfikację rodzaju, normalizację oraz
// budowanie URL "watch". Dodanie usługi oznacza dodanie tu dostawcy, a nie
// przepisywanie widoków kolejki, biblioteki czy pobierania.
interface MediaProvider {
  id: string;
  canResolve(url: string): boolean;
  kind(url: string): YouTubeResolveKind | null;
  normalizeUrl(url: string, kind: YouTubeResolveKind): string;
  // Buduje kanoniczny URL strony z identyfikatora elementu. Zwraca '' gdy
  // platforma nie potrafi odtworzyć URL z samego id (permalinki SoundCloud to
  // słowa, nie numeryczne id) — wywołujący muszą wtedy użyć pola `url` elementu.
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

// Kanoniczni budowniczowie URL. Widoki powinny używać ich zamiast ręcznej
// interpolacji URL-i platform, żeby zmiana schematu była w jednym miejscu.
export function buildYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** URL kanału z id `UC…` lub `@handle` (wiodące `@` opcjonalne). */
export function buildYouTubeChannelUrl(channelId: string): string {
  const id = channelId.trim();
  if (!id) return '';
  if (id.startsWith('@')) return `https://www.youtube.com/${id}`;
  return `https://www.youtube.com/channel/${encodeURIComponent(id)}`;
}

/** URL kanału z samego `@handle` (handle to nie id kanału). */
export function buildYouTubeHandleUrl(handle: string): string {
  const h = handle.trim().replace(/^@/, '');
  return h ? `https://www.youtube.com/@${encodeURIComponent(h)}` : '';
}

/** URL profilu ze sluga SoundCloud lub dowolnego URL soundcloud.com. */
export function buildSoundcloudProfileUrl(profileOrUrl: string): string {
  const slug = profileOrUrl
    .trim()
    .replace(/^https?:\/\/(?:www\.)?soundcloud\.com\//i, '')
    .replace(/^@/, '')
    .split('/')
    .filter(Boolean)[0];
  return slug ? `https://soundcloud.com/${encodeURIComponent(slug)}` : '';
}
