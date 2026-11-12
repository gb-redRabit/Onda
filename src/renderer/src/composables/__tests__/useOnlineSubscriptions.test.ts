import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const h = vi.hoisted(() => ({
  subscriptionsLoaded: false,
  subscriptions: [] as unknown[],
  loadSubscriptions: vi.fn(),
  getSubscription: vi.fn(),
  openChannel: vi.fn(),
  queueChannelVideos: vi.fn(),
  unfollowChannel: vi.fn(),
  buildChannelUrl: vi.fn((id: string, platform?: string) => `url:${id}:${platform ?? 'none'}`)
}));

vi.mock('@renderer/stores/online', () => ({
  useOnlineStore: () => ({
    get subscriptionsLoaded() {
      return h.subscriptionsLoaded;
    },
    get subscriptions() {
      return h.subscriptions;
    },
    loadSubscriptions: h.loadSubscriptions,
    getSubscription: h.getSubscription,
    openChannel: h.openChannel,
    queueChannelVideos: h.queueChannelVideos,
    unfollowChannel: h.unfollowChannel
  })
}));
vi.mock('@renderer/utils/onlineView', () => ({ buildChannelUrl: h.buildChannelUrl }));

import { useOnlineSubscriptions } from '../useOnlineSubscriptions';
import type { Subscription } from '@renderer/types/online';

const sub = {
  channelId: 'chan1',
  title: 'Channel',
  downloadPrefs: { kind: 'audio' }
} as unknown as Subscription;

beforeEach(() => {
  h.subscriptionsLoaded = false;
  h.subscriptions = [sub];
  for (const fn of [
    h.loadSubscriptions,
    h.getSubscription,
    h.openChannel,
    h.queueChannelVideos,
    h.unfollowChannel,
    h.buildChannelUrl
  ]) {
    fn.mockClear();
  }
  h.getSubscription.mockReturnValue({ platform: 'youtube' });
});

describe('section state', () => {
  it('starts on discover', () => {
    const { activeSection, prefsOpen, unfollowTarget } = useOnlineSubscriptions();

    expect(activeSection.value).toBe('discover');
    expect(prefsOpen.value).toBeNull();
    expect(unfollowTarget.value).toBeNull();
  });

  it('loads subscriptions when the section is opened first time', async () => {
    const { activeSection } = useOnlineSubscriptions();

    activeSection.value = 'subscriptions';
    await nextTick();
    expect(h.loadSubscriptions).toHaveBeenCalledTimes(1);

    h.subscriptionsLoaded = true;
    activeSection.value = 'discover';
    await nextTick();
    activeSection.value = 'subscriptions';
    await nextTick();
    expect(h.loadSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('openDiscover returns to the discover section', () => {
    const { activeSection, openDiscover } = useOnlineSubscriptions();
    activeSection.value = 'links';

    openDiscover();

    expect(activeSection.value).toBe('discover');
  });
});

describe('preferences and channel actions', () => {
  it('toggles the preferences dialog for the same channel only', () => {
    const { prefsOpen, togglePrefs } = useOnlineSubscriptions();

    togglePrefs(sub);
    expect(prefsOpen.value).toEqual(sub);

    togglePrefs(sub);
    expect(prefsOpen.value).toBeNull();

    togglePrefs(sub);
    togglePrefs({ ...sub, channelId: 'other' } as Subscription);
    expect(prefsOpen.value).toMatchObject({ channelId: 'other' });
  });

  it('opens a channel from a subscription using its platform', () => {
    const { activeSection, openChannelFromSubscription } = useOnlineSubscriptions();
    activeSection.value = 'subscriptions';

    openChannelFromSubscription('chan1');

    expect(activeSection.value).toBe('discover');
    expect(h.buildChannelUrl).toHaveBeenCalledWith('chan1', 'youtube');
    expect(h.openChannel).toHaveBeenCalledWith('url:chan1:youtube');
  });

  it('queues a single subscription with its preferences', () => {
    const { downloadSubscriptionAll } = useOnlineSubscriptions();

    downloadSubscriptionAll(sub);

    expect(h.queueChannelVideos).toHaveBeenCalledWith('chan1', { kind: 'audio' });
  });

  it('queues every subscription', () => {
    h.subscriptions = [sub, { ...sub, channelId: 'chan2' } as Subscription];
    const { downloadAllPending } = useOnlineSubscriptions();

    downloadAllPending();

    expect(h.queueChannelVideos).toHaveBeenCalledTimes(2);
    expect(h.queueChannelVideos).toHaveBeenNthCalledWith(2, 'chan2', { kind: 'audio' });
  });
});

describe('unfollowing', () => {
  it('confirms the target and unfollows it once', () => {
    const { unfollowTarget, confirmUnfollow, onUnfollowConfirm } = useOnlineSubscriptions();

    confirmUnfollow('chan1');
    expect(unfollowTarget.value).toBe('chan1');

    onUnfollowConfirm();
    expect(h.unfollowChannel).toHaveBeenCalledWith('chan1');
    expect(unfollowTarget.value).toBeNull();

    onUnfollowConfirm();
    expect(h.unfollowChannel).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no target was selected', () => {
    const { onUnfollowConfirm } = useOnlineSubscriptions();

    onUnfollowConfirm();

    expect(h.unfollowChannel).not.toHaveBeenCalled();
  });
});
