import { onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { useOnlineStore } from '@renderer/stores/online';

// Nieskończone przewijanie sterowane sentinelem dla widoku kanału, wyodrębnione z
// `components/online/OnlineChannelView.vue` (plan 2.8).
export function useChannelInfiniteScroll() {
  const yt = useOnlineStore();
  const sentinelRef = ref<HTMLElement | null>(null);
  let observer: IntersectionObserver | null = null;

  function maybeLoadMore() {
    if (!yt.channelHasMore || yt.channelLoading) return;
    const el = sentinelRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 200) {
      void yt.loadMoreChannel();
    }
  }

  function setSentinel(el: Element | ComponentPublicInstance | null) {
    sentinelRef.value = el instanceof Element ? (el as HTMLElement) : null;
    if (!observer) return;
    observer.disconnect();
    if (el instanceof Element) observer.observe(el);
  }

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) maybeLoadMore();
      },
      { root: null, rootMargin: '200px 0px' }
    );
  });

  onUnmounted(() => {
    observer?.disconnect();
    observer = null;
  });

  // Po zakończeniu ładowania strony sentinel może wciąż być widoczny (krótka lista),
  // więc pobieramy kolejne strony, aż wyjdzie poza viewport.
  watch(
    () => [yt.channelLoading, yt.channelHasMore],
    () => maybeLoadMore(),
    { flush: 'post' }
  );

  return { setSentinel, maybeLoadMore };
}
