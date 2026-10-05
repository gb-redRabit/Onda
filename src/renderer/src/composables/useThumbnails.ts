import { useMediaAssets } from './useMediaAssets';

/**
 * Miniatury wsadowe. Trzymane jako cienka otoczka nad `useMediaAssets`, aby ścieżka
 * wsadowa i per-plikowy `useThumbnail` eksploratora współdzieliły jeden cache LRU.
 */
export function useThumbnails(size = 180) {
  const { thumbs, request, get, flush } = useMediaAssets(size);
  // Sprzątanie (timery cache'u) robi `useMediaAssets` przez onScopeDispose — nie
  // wystawiamy osobnego no-op `dispose`, który nic nie robił.
  return {
    thumbs,
    request,
    getThumb: get,
    flush
  };
}
