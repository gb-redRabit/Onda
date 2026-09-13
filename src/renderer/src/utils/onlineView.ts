import { detectPlatform } from '@shared/platform';

// Pure helpers extracted from `views/OnlineView.vue` (plan 2.8).

// SoundCloud items may carry no URL at all (legacy saved entries resolve to a
// bare numeric id) — treat those as SoundCloud too.
export function isScItem(item: { id: string; url?: string }, url: string): boolean {
  if (!item.url && /^\d+$/.test(item.id)) return true;
  return detectPlatform(url)?.platform === 'soundcloud';
}

export function buildChannelUrl(channelId: string, platform?: string): string {
  return platform === 'soundcloud'
    ? `https://soundcloud.com/${channelId}`
    : `https://www.youtube.com/channel/${channelId}`;
}

export function countSkippedBatchLines(text: string, parsedCount: number): number {
  const total = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  return Math.max(0, total - parsedCount);
}

export function pageTotalFromCount(count: number, perPage = 20): number {
  return Math.ceil(count / perPage);
}
