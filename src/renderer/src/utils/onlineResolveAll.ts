import { detectPlatform } from '@shared/platform';
import type { YouTubeResolvedItem } from '@renderer/types/online';

// Never auto-load more than this many playlist items into memory — large
// playlists load on demand via the "load more" button instead.
export const RESOLVED_AUTO_CAP = 500;

// Loads every item of a playlist (platform-dispatched: YT playlists via
// yt:resolve, SoundCloud sets via sc:resolve), up to `cap` items.
export async function resolveAllPlaylistItems(
  url: string,
  cap = RESOLVED_AUTO_CAP
): Promise<{ items: YouTubeResolvedItem[]; totalItems: number | null }> {
  const isSc = detectPlatform(url)?.platform === 'soundcloud';
  const resolveChannel = isSc ? 'sc:resolve' : 'yt:resolve';
  const moreChannel = isSc ? 'sc:resolveMore' : 'yt:resolveMore';
  const items: YouTubeResolvedItem[] = [];
  let totalItems: number | null = null;
  let hasMore = false;
  const first = (await window.api?.invoke(resolveChannel, url)) as
    | {
        success?: boolean;
        result?: {
          items: YouTubeResolvedItem[];
          meta: { hasMore?: boolean; totalItems?: number | null };
        };
      }
    | undefined;
  if (!first?.success || !first.result) return { items, totalItems };
  items.push(...first.result.items);
  totalItems = first.result.meta.totalItems ?? null;
  hasMore = !!first.result.meta.hasMore;
  while (hasMore && items.length < cap) {
    const end = Math.min(items.length + 200, cap);
    const res = (await window.api?.invoke(moreChannel, {
      url,
      start: items.length + 1,
      end
    })) as
      | {
          success?: boolean;
          items?: YouTubeResolvedItem[];
          hasMore?: boolean;
          totalItems?: number | null;
        }
      | undefined;
    if (!res?.success || !res.items || res.items.length === 0) break;
    const seen = new Set(items.map((i) => i.id));
    items.push(...res.items.filter((i) => !seen.has(i.id)));
    if (res.totalItems != null) totalItems = res.totalItems;
    hasMore = !!res.hasMore && items.length < cap;
  }
  return { items, totalItems };
}
