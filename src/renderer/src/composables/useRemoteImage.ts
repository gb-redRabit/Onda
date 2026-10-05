import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { LruCache } from '@renderer/utils/lruCache';

// Ładuje zdalny obraz przez proces main (który zwraca zbuforowany URL `data:`).
// Używane dla awatarów/banerów kanałów, których renderer nie zawsze może załadować
// bezpośrednio (specyficzne dla hosta dziwactwa sieci/Chromium).

// Ograniczone, żeby przeglądanie wielu kanałów nie gromadziło blobów base64 na zawsze.
const cache = new LruCache<string>(200);

export function useRemoteImage(url: Ref<string | undefined | null>): Ref<string | null> {
  const src = ref<string | null>(null);
  let disposed = false;
  // Token żądania: wolna odpowiedź dla starego URL-a nie może nadpisać nowszego.
  let lastRequest = 0;
  onScopeDispose(() => {
    disposed = true;
  });

  watch(
    url,
    async (u) => {
      const requestId = ++lastRequest;
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
        if (disposed || requestId !== lastRequest) return;
        if (res) {
          cache.set(u, res);
          src.value = res;
        } else {
          src.value = null;
        }
      } catch {
        if (requestId === lastRequest) src.value = null;
      }
    },
    { immediate: true }
  );

  return src;
}
