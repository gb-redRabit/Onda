import { isScItem } from '@renderer/utils/onlineView';
import { detectPlatform, isHttpUrl } from '@shared/platform';
import type {
  YouTubeResolvedItem,
  YouTubeResolveResult,
  YouTubeVideo
} from '@renderer/types/online';

export type OnlineConfigTarget =
  { mode: 'single'; video: YouTubeVideo | YouTubeResolvedItem } | { mode: 'resolved' } | null;

export function configDialogTitle(
  target: OnlineConfigTarget,
  selectedCount: number,
  t: (key: string, params?: Record<string, unknown>) => string
): string {
  if (!target) return '';
  if (target.mode === 'single') return target.video.title;
  return t('youtube.itemsCount', { count: selectedCount });
}

export function configDialogChannelTitle(
  target: OnlineConfigTarget,
  resolved: YouTubeResolveResult | null
): string {
  if (!target) return '';
  if (target.mode === 'single') return target.video.channelTitle ?? '';
  return resolved?.meta.channelTitle || '';
}

export function configDialogPlaylistTitle(
  target: OnlineConfigTarget,
  resolved: YouTubeResolveResult | null
): string {
  if (!target) return '';
  if (target.mode === 'single') return target.video.channelTitle ?? '';
  return resolved?.meta.channelTitle || '';
}

// Platform of the item(s) being configured — SC shows a reduced dialog.
export function configDialogPlatform(
  target: OnlineConfigTarget,
  resolved: YouTubeResolveResult | null,
  itemUrl: (v: YouTubeVideo | YouTubeResolvedItem) => string
): 'youtube' | 'soundcloud' | 'generic' {
  if (!target) return 'youtube';
  const item = target.mode === 'single' ? target.video : resolved?.items[0];
  if (!item) return 'youtube';
  if (isScItem(item, itemUrl(item))) return 'soundcloud';
  const url = itemUrl(item);
  if (detectPlatform(url)?.platform === 'youtube') return 'youtube';
  return isHttpUrl(url) ? 'generic' : 'youtube';
}
