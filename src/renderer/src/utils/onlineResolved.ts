import type { YouTubeResolveResult, YouTubeResolvedItem } from '@renderer/types/online';

export interface ResolveMoreResponse {
  success?: boolean;
  items?: YouTubeResolvedItem[];
  hasMore?: boolean;
  totalItems?: number | null;
}

// Playlista, która mieści się na pierwszej stronie i nie zgłasza liczby, jest już
// w pełni wczytana — długość elementów to jej dokładna suma.
export function normalizeResolvedTotal(
  result: YouTubeResolveResult | null
): YouTubeResolveResult | null {
  if (
    result &&
    result.kind === 'playlist' &&
    !result.meta.hasMore &&
    result.meta.totalItems == null
  ) {
    return { ...result, meta: { ...result.meta, totalItems: result.items.length } };
  }
  return result;
}

export function mergeResolvedPage(
  current: YouTubeResolveResult,
  res: ResolveMoreResponse
): { resolved: YouTubeResolveResult; fresh: YouTubeResolvedItem[] } {
  const seen = new Set(current.items.map((i) => i.id));
  const fresh = (res.items || []).filter((i) => !seen.has(i.id));
  const resolved: YouTubeResolveResult = {
    ...current,
    items: [...current.items, ...fresh],
    meta: {
      ...current.meta,
      hasMore: res.hasMore,
      totalItems: res.totalItems || current.meta.totalItems
    }
  };
  return { resolved, fresh };
}
