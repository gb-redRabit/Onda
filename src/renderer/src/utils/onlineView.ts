import { detectPlatform } from '@shared/platform';
import { buildSoundcloudProfileUrl, buildYouTubeChannelUrl } from '@shared/provider';

// Czyste helpery wydzielone z `views/OnlineView.vue` (plan 2.8).

// Elementy SoundCloud mogą nie nieść żadnego URL (starsze zapisane wpisy rozwiązują się
// do gołego numerycznego id) — traktuj je również jako SoundCloud.
export function isScItem(item: { id: string; url?: string }, url: string): boolean {
  if (!item.url && /^\d+$/.test(item.id)) return true;
  return detectPlatform(url)?.platform === 'soundcloud';
}

export function buildChannelUrl(channelId: string, platform?: string): string {
  return platform === 'soundcloud'
    ? buildSoundcloudProfileUrl(channelId)
    : buildYouTubeChannelUrl(channelId);
}

export function countSkippedBatchLines(text: string, parsedCount: number): number {
  const total = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  return Math.max(0, total - parsedCount);
}
