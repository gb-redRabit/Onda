import { ref, watch } from 'vue';
import { useOnlineStore } from '@renderer/stores/online';
import { buildChannelUrl } from '@renderer/utils/onlineView';
import type { Subscription } from '@renderer/types/online';

// Subscriptions section state + actions (prefs dialog, unfollow, bulk queueing).
export function useOnlineSubscriptions() {
  const yt = useOnlineStore();
  const activeSection = ref<'discover' | 'subscriptions'>('discover');
  const prefsOpen = ref<Subscription | null>(null);
  const unfollowTarget = ref<string | null>(null);

  watch(activeSection, (section) => {
    if (section === 'subscriptions' && !yt.subscriptionsLoaded) {
      void yt.loadSubscriptions();
    }
  });

  function openDiscover() {
    activeSection.value = 'discover';
  }

  function togglePrefs(sub: Subscription) {
    prefsOpen.value = prefsOpen.value?.channelId === sub.channelId ? null : sub;
  }

  function openChannelFromSubscription(channelId: string) {
    openDiscover();
    const sub = yt.getSubscription(channelId);
    void yt.openChannel(buildChannelUrl(channelId, sub?.platform));
  }

  function downloadSubscriptionAll(sub: Subscription) {
    void yt.queueChannelVideos(sub.channelId, sub.downloadPrefs);
  }

  function downloadAllPending() {
    for (const sub of yt.subscriptions) {
      void yt.queueChannelVideos(sub.channelId, sub.downloadPrefs);
    }
  }

  function confirmUnfollow(channelId: string) {
    unfollowTarget.value = channelId;
  }

  function onUnfollowConfirm() {
    if (unfollowTarget.value) {
      yt.unfollowChannel(unfollowTarget.value);
    }
    unfollowTarget.value = null;
  }

  return {
    activeSection,
    prefsOpen,
    unfollowTarget,
    openDiscover,
    togglePrefs,
    openChannelFromSubscription,
    downloadSubscriptionAll,
    downloadAllPending,
    confirmUnfollow,
    onUnfollowConfirm
  };
}
