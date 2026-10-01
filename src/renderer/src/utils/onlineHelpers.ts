import type { MediaFile } from '@renderer/types/media';
import type { YouTubeResolvedItem } from '@renderer/types/online';
import type { IpcSavedStream } from '@shared/types/ipc';
import { detectPlatform } from '@shared/platform';
import {
  youtubeProvider,
  buildYouTubeChannelUrl,
  buildYouTubeHandleUrl,
  buildSoundcloudProfileUrl
} from '@shared/provider';

// Czyste helpery wydzielone z `stores/online.ts` (plan 2.7) — bez stanu store,
// więc żyją tutaj i utrzymują store skoncentrowany na orkiestracji.

// Kanoniczny URL strony elementu online — elementy SC niosą swój permalink,
// elementy YT są odbudowywane z id wideo. Starsze zapisane wpisy SC mają
// gołe numeryczne id (bez permalinku); sc:stream:get rozwiązuje je bezpośrednio.
export function streamTargetFor(item: { id: string; url?: string }): string {
  if (item.url) return item.url;
  if (/^\d+$/.test(item.id)) return item.id;
  return youtubeProvider.buildWatchUrl(item.id);
}

export function isSoundcloudItem(item: { id: string; url?: string }): boolean {
  if (!item.url && /^\d+$/.test(item.id)) return true;
  return detectPlatform(streamTargetFor(item))?.platform === 'soundcloud';
}

/** Kanoniczny cel w aplikacji dla znanego kanału YouTube lub profilu SoundCloud. */
export function channelPageUrl(item: { channelId?: string; url?: string }): string | null {
  const channelId = item.channelId?.trim();
  const platform = item.url ? detectPlatform(item.url)?.platform : null;
  if (platform === 'soundcloud') {
    return buildSoundcloudProfileUrl(channelId ?? '') || null;
  }
  if (platform === 'youtube' && channelId?.startsWith('@')) {
    return buildYouTubeHandleUrl(channelId);
  }
  if (
    channelId &&
    (platform === 'youtube' || (!item.url && /^UC[A-Za-z0-9_-]{20,}$/.test(channelId)))
  ) {
    return buildYouTubeChannelUrl(channelId) || null;
  }
  return null;
}

// Kanał IPC rozwiązujący bezpośredni URL strumienia dla danego celu.
export function streamChannelFor(target: string): 'yt:stream:get' | 'sc:stream:get' {
  if (/^\d+$/.test(target)) return 'sc:stream:get';
  return detectPlatform(target)?.platform === 'soundcloud' ? 'sc:stream:get' : 'yt:stream:get';
}

// Usuwa znaki wrogie systemowi plików i ogranicza długość nazwy pliku pobierania.
// Re-eksportowane pod historyczną nazwą; implementacja żyje teraz w
// @shared/text, więc proces główny używa dokładnie tej samej logiki.
export { sanitizeFilename as sanitizeFileName } from '@shared/text';

export function parseDurationText(text?: string): number | undefined {
  if (!text) return undefined;
  const parts = text.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return undefined;
  let secs = 0;
  for (const p of parts) secs = secs * 60 + p;
  return secs;
}

export function streamErrorMessage(t: (k: string) => string, code: string): string {
  switch (code) {
    case 'hls':
      return t('youtube.streamErrorHls');
    case 'auth-required':
      return t('youtube.streamErrorAuth');
    case 'bot-block':
      return t('youtube.streamErrorBot');
    case 'invalid':
      return t('youtube.streamErrorInvalid');
    case 'dependency':
      return t('youtube.streamErrorDependency');
    case 'not-found':
      return t('youtube.streamErrorNotFound');
    default:
      return t('youtube.streamErrorNetwork');
  }
}

export function buildStreamTrack(
  video: { id: string; title: string; duration?: string; thumbnail?: string; url?: string },
  path: string,
  order: number
): MediaFile {
  const isSc = isSoundcloudItem(video);
  return {
    id: `${isSc ? 'sc' : 'yt'}:${video.id}`,
    name: video.title,
    path,
    extension: '',
    mimeType: isSc ? 'audio/mpeg' : 'audio/mp4',
    size: 0,
    type: 'stream',
    duration: parseDurationText(video.duration),
    thumbnail: video.thumbnail,
    addedAt: Date.now() + order,
    playCount: 0
  };
}

export function resolvedToSavedStream(i: YouTubeResolvedItem): IpcSavedStream {
  return { ...i, savedAt: Date.now() };
}

export function savedStreamToItem(s: IpcSavedStream): YouTubeResolvedItem {
  return {
    id: s.id,
    title: s.title,
    thumbnail: s.thumbnail ?? '',
    channelTitle: s.channelTitle ?? '',
    channelId: s.channelId ?? '',
    duration: s.duration,
    isPlayable: true,
    ...(s.url ? { url: s.url } : {})
  };
}
