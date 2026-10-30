import { ref } from 'vue';
import { i18n } from '@renderer/i18n';
import { useUIStore } from '@renderer/stores/ui';
import type { Subscription, SubscriptionDownloadPrefs } from '@renderer/types/online';
import type { IpcSubscriptionCheckResult } from '@shared/types/ipc';

export interface SubscriptionChannelRef {
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  platform?: 'youtube' | 'soundcloud';
}

export interface OnlineSubscriptionActionsDeps {
  addSubscription: (sub: Subscription) => void;
  removeSubscription: (channelId: string) => void;
  getSubscription: (channelId: string) => Subscription | undefined;
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
  const {
    addSubscription,
    removeSubscription,
    getSubscription,
    loadSubscriptions,
    queueChannelVideos
  } = deps;
  const checkingSubscriptions = ref(false);
  const checkingChannelId = ref<string | null>(null);

  // Ręczne sprawdzanie musi dać widoczny wynik — wcześniej brakujące pliki były
  // tylko po cichu odznaczane, więc kliknięcie wyglądało jak brak reakcji.
  function notifyCheckResult(result: IpcSubscriptionCheckResult | undefined): void {
    if (!result) return;
    const ui = useUIStore();
    const t = i18n.global.t;
    if (result.busy) {
      ui.notify('info', t('youtube.checkBusy'));
      return;
    }
    if (result.missing?.length) {
      const titles = result.missing
        .map((item) => item.title)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      ui.notify('warning', t('youtube.checkMissing', { count: result.missing.length, titles }));
      return;
    }
    if (result.errors > 0) {
      ui.notify('error', t('youtube.checkErrors', { count: result.errors }));
      return;
    }
    ui.notify(
      'success',
      t('youtube.checkDone', { checked: result.checked, newVideos: result.newVideos })
    );
  }

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

  // Odobserwowanie da się cofnąć z toastu: przywracamy ten sam wpis (te same
  // preferencje) i nie seedujemy baseline, żeby powrót nie zakolejkował całego
  // kanału ponownie.
  async function restoreSubscription(sub: Subscription): Promise<void> {
    try {
      // `invoke` przyjmuje luźniejszy kontrakt IPC; obiekt w zmiennej omija
      // nadmiarową kontrolę literału (platform jest znane handlerowi).
      const input = {
        channelId: sub.channelId,
        channelTitle: sub.channelTitle,
        channelThumbnail: sub.channelThumbnail,
        platform: sub.platform,
        downloadPrefs: sub.downloadPrefs,
        seedBaseline: false
      };
      const restored = (await window.api.invoke('yt:subs:add', input)) as Subscription | null;
      if (restored) addSubscription(restored);
    } catch {
      /* nie udało się przywrócić subskrypcji */
    }
  }

  async function unfollowChannel(channelId: string) {
    const sub = getSubscription(channelId);
    try {
      await window.api.invoke('yt:subs:remove', channelId);
      removeSubscription(channelId);
      if (sub) {
        const ui = useUIStore();
        const t = i18n.global.t;
        ui.notify('info', t('youtube.unfollowed', { name: sub.channelTitle }), undefined, 8000, {
          label: t('common.undo'),
          run: () => void restoreSubscription(sub)
        });
      }
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
      const result = (await window.api.invoke('yt:subs:checkNow')) as
        IpcSubscriptionCheckResult | undefined;
      await loadSubscriptions();
      notifyCheckResult(result);
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
      const result = (await window.api.invoke('yt:subs:checkChannel', channelId)) as
        IpcSubscriptionCheckResult | undefined;
      await loadSubscriptions();
      notifyCheckResult(result);
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
