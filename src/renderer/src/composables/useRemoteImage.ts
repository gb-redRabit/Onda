import { ref, watch, type Ref } from 'vue';

// Loads a remote image through the main process (which returns a cached `data:`
// URL). Used for channel avatars/banners, which the renderer cannot always load
// directly (host-specific network/Chromium quirks).

const cache = new Map<string, string>();

export function useRemoteImage(url: Ref<string | undefined | null>): Ref<string | null> {
  const src = ref<string | null>(null);

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
