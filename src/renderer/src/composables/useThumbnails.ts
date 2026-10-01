import { useMediaAssets } from './useMediaAssets';

/**
 * Batch thumbnails. Kept as a thin wrapper over `useMediaAssets` so the batch
 * path and the explorer's per-file `useThumbnail` share one LRU cache.
 */
export function useThumbnails(size = 180) {
  const { thumbs, request, get, flush } = useMediaAssets(size);
  return {
    thumbs,
    request,
    getThumb: get,
    flush,
    // Kept for API compatibility; the timer is released via onScopeDispose.
    dispose: () => {}
  };
}
