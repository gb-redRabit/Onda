import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { LruCache } from '@renderer/utils/lruCache';

// Loads a remote image through the main process (which returns a cached `data:`
// URL). Used for channel avatars/banners, which the renderer cannot always load
// directly (host-specific network/Chromium quirks).

// Bounded so browsing many channels cannot accumulate base64 blobs forever.
const cache = new LruCache<string>(200);

export function useRemoteImage(url: Ref<string | undefined | null>): Ref<string | null> {
  const src = ref<string | null>(null);
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });

  watch(
    url,
    async (u) => {
      if (!u || !/^https:\/\//i.test(u)) {
        src.value = null;
        return;
      }
      const cached = cache.get(u);
      if (cached) {
        src.value = cached;
        return;
      }
      try {
        const res = (await window.api?.invoke('media:remoteImage', u)) as string | null;
        if (disposed) return;
        if (res) {
          cache.set(u, res);
          src.value = res;
        } else {
          src.value = null;
        }
      } catch {
        src.value = null;
      }
    },
    { immediate: true }
  );

  return src;
}
