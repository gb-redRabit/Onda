import { ref } from 'vue';
import type { Subscription } from '@renderer/types/online';

// Subscriptions collection + local mutation helpers. Reference-counting and
// persistence stay in main (yt:subs:*); this module only holds the in-memory
// list and optimistic updates. The store destructures the returned refs/actions
// back into the same names, so call sites elsewhere are unchanged.
export function createOnlineSubscriptions() {
  const subscriptions = ref<Subscription[]>([]);
  const subscriptionsLoaded = ref(false);

  function addSubscription(sub: Subscription) {
    const idx = subscriptions.value.findIndex((s) => s.channelId === sub.channelId);
    if (idx >= 0) subscriptions.value[idx] = sub;
    else subscriptions.value.push(sub);
    subscriptionsLoaded.value = true;
  }

  function removeSubscription(channelId: string) {
    subscriptions.value = subscriptions.value.filter((s) => s.channelId !== channelId);
  }

  function isSubscribed(channelId: string): boolean {
    return subscriptions.value.some((s) => s.channelId === channelId);
  }

  function getSubscription(channelId: string): Subscription | undefined {
    return subscriptions.value.find((s) => s.channelId === channelId);
  }

  function isVideoDownloaded(videoId: string, channelId?: string): boolean {
    if (!channelId) return false;
    const sub = getSubscription(channelId);
    return !!sub && (sub.downloadedVideoIds || []).includes(videoId);
  }

  // Optimistic local update only. Persistence is handled in main by
  // setDownloadCompletedHandler (atomic append + yt:subs:updated broadcast),
  // so this never writes a stale full array over the file. pendingCount is
  // decremented here too so the „do pobrania" badge is live while downloading.
  function markVideoDownloaded(videoId: string, channelId: string) {
    const sub = getSubscription(channelId);
    if (!sub) return;
    const known = new Set(sub.downloadedVideoIds || []);
    const wasKnown = known.has(videoId);
    known.add(videoId);
    const queued = (sub.queuedVideoIds || []).filter((id) => id !== videoId);
    const pendingCount =
      sub.pendingCount != null && !wasKnown ? Math.max(0, sub.pendingCount - 1) : sub.pendingCount;
    addSubscription({
      ...sub,
      downloadedVideoIds: [...known],
      queuedVideoIds: queued,
      pendingCount
    });
  }

  async function loadSubscriptions() {
    try {
      const list = (await window.api.invoke('yt:subs:list')) as Subscription[] | null;
      if (list) subscriptions.value = list;
    } catch {
      /* subscriptions unavailable */
    }
    subscriptionsLoaded.value = true;
  }

  return {
    subscriptions,
    subscriptionsLoaded,
    addSubscription,
    removeSubscription,
    isSubscribed,
    getSubscription,
    isVideoDownloaded,
    markVideoDownloaded,
    loadSubscriptions
  };
}
