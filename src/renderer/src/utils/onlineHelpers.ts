import type { MediaFile } from '@renderer/types/media';
import type { YouTubeResolvedItem } from '@renderer/types/online';
import type { IpcSavedStream } from '@shared/types/ipc';
import { detectPlatform } from '@shared/platform';
import { youtubeProvider } from '@shared/provider';

// Pure helpers extracted from `stores/online.ts` (plan 2.7) — no store state,
// so they live here and keep the store focused on orchestration.

// Canonical page URL of an online item — SC items carry their permalink,
// YT items are rebuilt from the video id. Legacy saved SC entries have a
// bare numeric id (no permalink); sc:stream:get resolves those directly.
export function streamTargetFor(item: { id: string; url?: string }): string {
  if (item.url) return item.url;
  if (/^\d+$/.test(item.id)) return item.id;
  return youtubeProvider.buildWatchUrl(item.id);
}

export function isSoundcloudItem(item: { id: string; url?: string }): boolean {
  if (!item.url && /^\d+$/.test(item.id)) return true;
  return detectPlatform(streamTargetFor(item))?.platform === 'soundcloud';
}

// IPC channel resolving the direct stream URL for a given target.
export function streamChannelFor(target: string): 'yt:stream:get' | 'sc:stream:get' {
  if (/^\d+$/.test(target)) return 'sc:stream:get';
  return detectPlatform(target)?.platform === 'soundcloud' ? 'sc:stream:get' : 'yt:stream:get';
}

// Strips filesystem-hostile characters and caps the length for a download
// file name (http/soundcloud jobs write the bytes directly under this name).
export function sanitizeFileName(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex -- control chars are invalid in file names
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[.\s]+$/, '');
  return (cleaned || 'track').slice(0, 120);
}

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
