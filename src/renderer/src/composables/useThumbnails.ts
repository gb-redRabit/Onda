import { ref } from 'vue';

const globalCache = new Map<string, string>();

export function useThumbnails(size = 180) {
  const thumbs = ref<Record<string, string>>({});
  let pending: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    if (pending.length === 0) return;
    const batch = [...new Set(pending)];
    pending = [];
    const toFetch = batch.filter((p) => !globalCache.has(p) && !thumbs.value[p]);
    if (toFetch.length === 0) {
      // już w cache
      const filled: Record<string, string> = {};
      for (const p of batch) {
        const v = globalCache.get(p) || thumbs.value[p];
        if (v) filled[p] = v;
      }
      if (Object.keys(filled).length) thumbs.value = { ...thumbs.value, ...filled };
      return;
    }
    try {
      const result = (await window.api?.invoke('media:batchThumbnails', toFetch, size)) as
        Record<string, string> | undefined;
      if (result) {
        for (const [k, v] of Object.entries(result)) {
          globalCache.set(k, v);
        }
        thumbs.value = { ...thumbs.value, ...result };
      }
    } catch {}
  }

  function request(paths: string[]) {
    const uniq = paths.filter((p) => p && !globalCache.has(p) && !thumbs.value[p]);
    if (uniq.length === 0) {
      // od razu uzupełnij z globalCache
      const filled: Record<string, string> = {};
      for (const p of paths) {
        const v = globalCache.get(p);
        if (v) filled[p] = v;
      }
      if (Object.keys(filled).length) thumbs.value = { ...thumbs.value, ...filled };
      return;
    }
    pending.push(...uniq);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 40);
  }

  function getThumb(path: string): string | undefined {
    return thumbs.value[path] || globalCache.get(path);
  }

  // auto-flush gdy komponent odmontowany
  function dispose() {
    if (timer) clearTimeout(timer);
  }

  return { thumbs, request, getThumb, flush, dispose };
}
