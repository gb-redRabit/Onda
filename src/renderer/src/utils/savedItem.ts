import type { YouTubeResolvedItem } from '@renderer/types/online';

// Maps a saved track/playlist item to the resolved-item shape used by the
// online cards. Extracted from `views/WebcastView.vue` (plan 2.8).
export function toResolvedItem(s: {
  id: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
  url?: string;
}): YouTubeResolvedItem {
  return {
    id: s.id,
    title: s.title,
    thumbnail: s.thumbnail ?? '',
    channelTitle: s.channelTitle ?? '',
    channelId: s.channelId ?? '',
    duration: s.duration,
    isPlayable: true,
    // SoundCloud permalink — without it a numeric SC id cannot be turned into
    // a playable URL.
    ...(s.url ? { url: s.url } : {})
  };
}
