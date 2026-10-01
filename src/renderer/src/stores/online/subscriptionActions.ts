import { ref } from 'vue';
import type { Subscription, SubscriptionDownloadPrefs } from '@renderer/types/online';

export interface SubscriptionChannelRef {
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  platform?: 'youtube' | 'soundcloud';
}

export interface OnlineSubscriptionActionsDeps {
  addSubscription: (sub: Subscription) => void;
  removeSubscription: (channelId: string) => void;
  loadSubscriptions: () => Promise<void>;
  queueChannelVideos: (
    channelId: string,
    prefs?: SubscriptionDownloadPrefs,
    includeDownloaded?: boolean
  ) => Promise<void>;
}

// Obserwowanie/odobserwowanie + mutacje preferencji dla subskrypcji oraz ręczne
// akcje "sprawdź teraz". Persystencja pozostaje w main (yt:subs:*); ten moduł trzyma
// tylko flagi w toku i optymistyczne lokalne aktualizacje. Store destrukturyzuje
// zwrócone refy/akcje z powrotem do tych samych nazw, więc miejsca wywołań gdzie indziej
// pozostają bez zmian.
export function createOnlineSubscriptionActions(deps: OnlineSubscriptionActionsDeps) {
  const { addSubscription, removeSubscription, loadSubscriptions, queueChannelVideos } = deps;
  const checkingSubscriptions = ref(false);
  const checkingChannelId = ref<string | null>(null);

  async function followChannel(channel: SubscriptionChannelRef) {
    try {
      const sub = (await window.api.invoke('yt:subs:add', channel)) as Subscription | null;
      if (sub) addSubscription(sub);
    } catch {
      /* nie udało się zaobserwować */
    }
  }

  async function followChannelWithSetup(
    channel: SubscriptionChannelRef,
    setup: { prefs?: SubscriptionDownloadPrefs; downloadAll: boolean }
  ) {
    try {
      const input = {
        ...channel,
        platform:
          channel.platform === 'soundcloud' ? ('soundcloud' as const) : ('youtube' as const),
        downloadPrefs: setup.prefs,
        seedBaseline: !setup.downloadAll
      };
      const sub = (await window.api.invoke('yt:subs:add', input)) as Subscription | null;
      if (sub) addSubscription(sub);
      if (sub && setup.downloadAll) {
        await queueChannelVideos(sub.channelId, setup.prefs || sub.downloadPrefs, true);
      }
    } catch {
      /* nie udało się zaobserwować */
    }
  }

  async function unfollowChannel(channelId: string) {
    try {
      await window.api.invoke('yt:subs:remove', channelId);
      removeSubscription(channelId);
    } catch {
      /* nie udało się odobserwować */
    }
  }

  async function setAutoDownload(channelId: string, enabled: boolean) {
    try {
      const sub = (await window.api.invoke('yt:subs:update', channelId, {
        autoDownload: enabled
      })) as Subscription | null;
      if (sub) addSubscription(sub);
    } catch {
      /* nie udało się zaktualizować */
    }
  }

  async function setDownloadPrefs(channelId: string, prefs: SubscriptionDownloadPrefs) {
    try {
      const sub = (await window.api.invoke('yt:subs:update', channelId, {
        downloadPrefs: prefs
      })) as Subscription | null;
      if (sub) addSubscription(sub);
    } catch {
      /* nie udało się zaktualizować preferencji */
    }
  }

  async function checkSubscriptionsNow() {
    if (checkingSubscriptions.value) return;
    checkingSubscriptions.value = true;
    try {
      await window.api.invoke('yt:subs:checkNow');
      await loadSubscriptions();
    } catch {
      /* sprawdzanie nie powiodło się */
    } finally {
      checkingSubscriptions.value = false;
    }
  }

  async function checkChannelNow(channelId: string) {
    if (checkingChannelId.value) return;
    checkingChannelId.value = channelId;
    try {
      await window.api.invoke('yt:subs:checkChannel', channelId);
      await loadSubscriptions();
    } catch {
      /* sprawdzanie nie powiodło się */
    } finally {
      checkingChannelId.value = null;
    }
  }

  return {
    checkingSubscriptions,
    checkingChannelId,
    followChannel,
    followChannelWithSetup,
    unfollowChannel,
    setAutoDownload,
    setDownloadPrefs,
    checkSubscriptionsNow,
    checkChannelNow
  };
}
