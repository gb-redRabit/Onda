import { ref, onScopeDispose } from 'vue';
import { logger } from '@shared/logger';
import { cachedThumb, setCachedThumb } from '@renderer/utils/thumbLoader';

/**
 * Unified batch-thumbnail access for the library and explorer. Fetches through
 * `media:batchThumbnails` and shares the single LRU cache (`thumbLoader`) with
 * the explorer's per-file `useThumbnail`, so a thumbnail loaded by either path
 * is immediately available to the other — one cache, one source of truth.
 */
export function useMediaAssets(size = 180) {
  const thumbs = ref<Record<string, string>>({});
  let pending: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  // The 40ms flush timer must not outlive the component scope.
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
    if (Object.keys(filled).length) thumbs.value = { ...thumbs.value, ...filled };
    if (toFetch.length === 0) return;
    try {
      const result = (await window.api?.invoke('media:batchThumbnails', toFetch, size)) as
        | Record<string, string>
        | undefined;
      if (result) {
        for (const [k, v] of Object.entries(result)) setCachedThumb(k, v);
        thumbs.value = { ...thumbs.value, ...result };
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
    if (Object.keys(filled).length) thumbs.value = { ...thumbs.value, ...filled };
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
