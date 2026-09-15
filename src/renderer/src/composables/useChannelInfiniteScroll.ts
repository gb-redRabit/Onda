import { onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { useOnlineStore } from '@renderer/stores/online';

// Sentinel-driven infinite scroll for the channel view, extracted from
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

  // After a page finishes loading the sentinel may still be in view (short list),
  // so keep pulling pages until it scrolls out of the viewport.
  watch(
    () => [yt.channelLoading, yt.channelHasMore],
    () => maybeLoadMore(),
    { flush: 'post' }
  );

  return { setSentinel, maybeLoadMore };
}
