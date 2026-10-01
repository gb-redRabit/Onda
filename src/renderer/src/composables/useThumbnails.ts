import { useMediaAssets } from './useMediaAssets';

/**
 * Miniatury wsadowe. Trzymane jako cienka otoczka nad `useMediaAssets`, aby ścieżka
 * wsadowa i per-plikowy `useThumbnail` eksploratora współdzieliły jeden cache LRU.
 */
export function useThumbnails(size = 180) {
  const { thumbs, request, get, flush } = useMediaAssets(size);
  return {
    thumbs,
    request,
    getThumb: get,
    flush,
    // Zachowane dla kompatybilności API; timer jest zwalniany przez onScopeDispose.
    dispose: () => {}
  };
}
