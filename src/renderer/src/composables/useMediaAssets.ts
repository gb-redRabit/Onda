import { ref, onScopeDispose } from 'vue';
import { logger } from '@shared/logger';
import { cachedThumb, setCachedThumb } from '@renderer/utils/thumbLoader';

/**
 * Ujednolicony dostęp do miniatur wsadowych dla biblioteki i eksploratora. Pobiera przez
 * `media:batchThumbnails` i współdzieli pojedynczy cache LRU (`thumbLoader`) z
 * per-plikowym `useThumbnail` eksploratora, więc miniatura załadowana przez jedną ścieżkę
 * jest natychmiast dostępna dla drugiej — jeden cache, jedno źródło prawdy.
 */
// Lokalny rekord trzyma tylko to, co widoczne; główny cache (thumbLoader) jest
// współdzielony i ograniczony. Bez limitu rekord rósł z każdym przewiniętym
// plikiem przez cały czas życia widoku.
const MAX_LOCAL_THUMBS = 1000;

export function useMediaAssets(size = 180) {
  const thumbs = ref<Record<string, string>>({});
  let pending: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function mergeThumbs(extra: Record<string, string>): void {
    const merged = { ...thumbs.value, ...extra };
    const keys = Object.keys(merged);
    if (keys.length > MAX_LOCAL_THUMBS) {
      // Wpisy mogły zostać usunięte z głównego cache; zachowaj najnowsze.
      const keep = new Set(keys.slice(keys.length - MAX_LOCAL_THUMBS));
      for (const k of keys) if (!keep.has(k)) delete merged[k];
    }
    thumbs.value = merged;
  }

  // 40-milisekundowy timer flush nie może przeżyć zakresu komponentu.
  onScopeDispose(() => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });

  async function flush(): Promise<void> {
    if (pending.length === 0) return;
    const batch = [...new Set(pending)];
    pending = [];
    const filled: Record<string, string> = {};
    const toFetch: string[] = [];
    for (const p of batch) {
      const v = cachedThumb(p) ?? thumbs.value[p];
      if (v) filled[p] = v;
      else toFetch.push(p);
    }
    if (Object.keys(filled).length) mergeThumbs(filled);
    if (toFetch.length === 0) return;
    try {
      const result = (await window.api?.invoke('media:batchThumbnails', toFetch, size)) as
        Record<string, string> | undefined;
      if (result) {
        for (const [k, v] of Object.entries(result)) setCachedThumb(k, v);
        mergeThumbs(result);
      }
    } catch (e) {
      logger.warn('thumbnails', 'media:batchThumbnails failed', e);
    }
  }

  function request(paths: string[]): void {
    const filled: Record<string, string> = {};
    const uniq: string[] = [];
    for (const p of paths) {
      if (!p) continue;
      const v = cachedThumb(p) ?? thumbs.value[p];
      if (v) filled[p] = v;
      else uniq.push(p);
    }
    if (Object.keys(filled).length) mergeThumbs(filled);
    if (uniq.length === 0) return;
    pending.push(...uniq);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 40);
  }

  function get(path: string): string | undefined {
    return thumbs.value[path] ?? cachedThumb(path);
  }

  return { thumbs, request, get, flush };
}
