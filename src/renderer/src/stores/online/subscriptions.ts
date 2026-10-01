import { ref } from 'vue';
import type { Subscription } from '@renderer/types/online';

// Kolekcja subskrypcji + lokalne helpery mutacji. Liczenie referencji i
// persystencja pozostają w main (yt:subs:*); ten moduł trzyma tylko listę w pamięci
// i optymistyczne aktualizacje. Store destrukturyzuje zwrócone refy/akcje
// z powrotem do tych samych nazw, więc miejsca wywołań gdzie indziej pozostają bez zmian.
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

  // Tylko optymistyczna lokalna aktualizacja. Persystencja jest obsługiwana w main przez
  // setDownloadCompletedHandler (atomowe dopisanie + broadcast yt:subs:updated),
  // więc to nigdy nie nadpisuje pliku nieaktualną pełną tablicą. pendingCount jest
  // tu również dekrementowany, więc plakietka "do pobrania" jest aktualna podczas pobierania.
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
      /* subskrypcje niedostępne */
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
