import type { YouTubeResolvedItem } from '@renderer/types/online';

// Mapuje zapisany utwór/element playlisty na kształt resolved-item używany przez
// karty online. Wydzielone z `views/WebcastView.vue` (plan 2.8).
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
    // Permalink SoundCloud — bez niego numerycznego id SC nie da się zamienić na
    // odtwarzalny URL.
    ...(s.url ? { url: s.url } : {})
  };
}
