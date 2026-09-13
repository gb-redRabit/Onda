import type { YouTubeResolveResult, YouTubeResolvedItem } from '@renderer/types/online';

export interface ResolveMoreResponse {
  success?: boolean;
  items?: YouTubeResolvedItem[];
  hasMore?: boolean;
  totalItems?: number | null;
}

// A playlist that fits on the first page and reports no count is already fully
// loaded — the items length is its exact total.
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
