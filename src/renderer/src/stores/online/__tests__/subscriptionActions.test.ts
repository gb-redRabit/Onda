import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createOnlineSubscriptionActions } from '../subscriptionActions';
import { useUIStore } from '@renderer/stores/ui';
import type { Subscription } from '@renderer/types/online';

// Siatka regresyjna dla akcji subskrypcji renderera: obserwowanie/odobserwowanie,
// preferencje, ręczne sprawdzanie (z blokadą równoległości) i masowe kolejkowanie.

const invoke = vi.fn();
beforeEach(() => {
  setActivePinia(createPinia());
  invoke.mockReset();
  (window as unknown as { api: unknown }).api = { invoke };
});

function makeDeps() {
  return {
    addSubscription: vi.fn(),
    removeSubscription: vi.fn(),
    getSubscription: vi.fn(),
    loadSubscriptions: vi.fn(async () => {}),
    queueChannelVideos: vi.fn(async () => {})
  };
}

const CHANNEL = { channelId: 'UC1', channelTitle: 'A', channelThumbnail: '' };
const SUB: Subscription = {
  id: 'sub-1',
  channelId: 'UC1',
  channelTitle: 'A',
  channelThumbnail: '',
  autoDownload: true,
  addedAt: 1
};

describe('followChannel', () => {
  it('subscribes and adds the returned subscription locally', async () => {
    const deps = makeDeps();
    invoke.mockResolvedValueOnce(SUB);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.followChannel(CHANNEL);
    expect(invoke).toHaveBeenCalledWith('yt:subs:add', CHANNEL);
    expect(deps.addSubscription).toHaveBeenCalledWith(SUB);
  });

  it('swallows IPC errors', async () => {
    const deps = makeDeps();
    invoke.mockRejectedValueOnce(new Error('nope'));
    const actions = createOnlineSubscriptionActions(deps);
    await expect(actions.followChannel(CHANNEL)).resolves.toBeUndefined();
    expect(deps.addSubscription).not.toHaveBeenCalled();
  });
});

describe('followChannelWithSetup', () => {
  it('seeds the baseline and queues nothing when not downloading all', async () => {
    const deps = makeDeps();
    invoke.mockResolvedValueOnce(SUB);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.followChannelWithSetup(CHANNEL, { downloadAll: false });
    const input = invoke.mock.calls[0][1] as { seedBaseline: boolean; platform: string };
    expect(input.seedBaseline).toBe(true);
    expect(input.platform).toBe('youtube');
    expect(deps.queueChannelVideos).not.toHaveBeenCalled();
  });

  it('queues the whole channel when downloading all', async () => {
    const deps = makeDeps();
    invoke.mockResolvedValueOnce(SUB);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.followChannelWithSetup(CHANNEL, { downloadAll: true });
    const input = invoke.mock.calls[0][1] as { seedBaseline: boolean };
    expect(input.seedBaseline).toBe(false);
    expect(deps.queueChannelVideos).toHaveBeenCalledWith('UC1', SUB.downloadPrefs, true);
  });
});

describe('unfollowChannel', () => {
  it('removes via IPC and locally', async () => {
    const deps = makeDeps();
    invoke.mockResolvedValueOnce(true);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.unfollowChannel('UC1');
    expect(invoke).toHaveBeenCalledWith('yt:subs:remove', 'UC1');
    expect(deps.removeSubscription).toHaveBeenCalledWith('UC1');
  });

  it('offers an undo toast that restores the same subscription without reseeding', async () => {
    const deps = makeDeps();
    deps.getSubscription.mockReturnValue(SUB);
    invoke.mockResolvedValueOnce(true);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.unfollowChannel('UC1');

    const toast = useUIStore().notifications[0];
    expect(toast?.action?.label).toBeTruthy();

    invoke.mockResolvedValueOnce(SUB);
    toast!.action!.run();
    await vi.waitFor(() => expect(deps.addSubscription).toHaveBeenCalledWith(SUB));

    const restoreInput = invoke.mock.calls.find((c) => c[0] === 'yt:subs:add')?.[1] as {
      channelId: string;
      seedBaseline: boolean;
    };
    expect(restoreInput.channelId).toBe('UC1');
    expect(restoreInput.seedBaseline).toBe(false);
  });
});

describe('preferences', () => {
  it('setAutoDownload patches via IPC and updates locally', async () => {
    const deps = makeDeps();
    invoke.mockResolvedValueOnce({ ...SUB, autoDownload: false });
    const actions = createOnlineSubscriptionActions(deps);
    await actions.setAutoDownload('UC1', false);
    expect(invoke).toHaveBeenCalledWith('yt:subs:update', 'UC1', { autoDownload: false });
    expect(deps.addSubscription).toHaveBeenCalledWith({ ...SUB, autoDownload: false });
  });

  it('setDownloadPrefs patches via IPC and updates locally', async () => {
    const deps = makeDeps();
    const prefs = { quality: '1080p' };
    invoke.mockResolvedValueOnce({ ...SUB, downloadPrefs: prefs });
    const actions = createOnlineSubscriptionActions(deps);
    await actions.setDownloadPrefs('UC1', prefs);
    expect(invoke).toHaveBeenCalledWith('yt:subs:update', 'UC1', { downloadPrefs: prefs });
    expect(deps.addSubscription).toHaveBeenCalledWith({ ...SUB, downloadPrefs: prefs });
  });
});

describe('manual checks', () => {
  it('checkSubscriptionsNow runs the global check and reloads', async () => {
    const deps = makeDeps();
    invoke.mockResolvedValue(undefined);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.checkSubscriptionsNow();
    expect(invoke).toHaveBeenCalledWith('yt:subs:checkNow');
    expect(deps.loadSubscriptions).toHaveBeenCalled();
    expect(actions.checkingSubscriptions.value).toBe(false);
  });

  it('checkSubscriptionsNow guards against overlapping runs', async () => {
    const deps = makeDeps();
    let release: () => void = () => {};
    invoke.mockImplementationOnce(() =>
      new Promise<void>((r) => (release = r)).then(() => undefined)
    );
    const actions = createOnlineSubscriptionActions(deps);
    const first = actions.checkSubscriptionsNow();
    await actions.checkSubscriptionsNow(); // widzi checkingSubscriptions = true
    expect(invoke).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('checkChannelNow passes the channelId and clears the flag', async () => {
    const deps = makeDeps();
    invoke.mockResolvedValue(undefined);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.checkChannelNow('UC9');
    expect(invoke).toHaveBeenCalledWith('yt:subs:checkChannel', 'UC9');
    expect(actions.checkingChannelId.value).toBeNull();
  });

  it('checkChannelNow guards against overlapping runs per channel', async () => {
    const deps = makeDeps();
    let release: () => void = () => {};
    invoke.mockImplementationOnce(() =>
      new Promise<void>((r) => (release = r)).then(() => undefined)
    );
    const actions = createOnlineSubscriptionActions(deps);
    const first = actions.checkChannelNow('UC9');
    await actions.checkChannelNow('UC9');
    expect(invoke).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(actions.checkingChannelId.value).toBeNull();
  });

  it('swallows a failed global check and resets the flag', async () => {
    const deps = makeDeps();
    invoke.mockRejectedValueOnce(new Error('offline'));
    const actions = createOnlineSubscriptionActions(deps);

    await expect(actions.checkSubscriptionsNow()).resolves.toBeUndefined();
    expect(actions.checkingSubscriptions.value).toBe(false);
  });

  it('swallows a failed single-channel check', async () => {
    const deps = makeDeps();
    invoke.mockRejectedValueOnce(new Error('offline'));
    const actions = createOnlineSubscriptionActions(deps);

    await expect(actions.checkChannelNow('UC9')).resolves.toBeUndefined();
    expect(actions.checkingChannelId.value).toBeNull();
  });
});

describe('check notifications', () => {
  async function checkWith(result: unknown) {
    const deps = makeDeps();
    invoke.mockResolvedValueOnce(result);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.checkSubscriptionsNow();
    return useUIStore().notifications.at(-1);
  }

  it('reports a busy checker as info', async () => {
    expect((await checkWith({ busy: true, checked: 0, newVideos: 0, errors: 0 }))?.type).toBe(
      'info'
    );
  });

  it('warns about missing files with their titles', async () => {
    const toast = await checkWith({
      checked: 2,
      newVideos: 0,
      errors: 0,
      missing: [{ title: 'Gone A' }, { title: '' }, { title: 'Gone B' }]
    });

    expect(toast?.type).toBe('warning');
    expect(toast?.title).toBeTruthy();
  });

  it('reports channel errors', async () => {
    expect((await checkWith({ checked: 2, newVideos: 1, errors: 2 }))?.type).toBe('error');
  });

  it('reports a successful check', async () => {
    expect((await checkWith({ checked: 3, newVideos: 1, errors: 0 }))?.type).toBe('success');
  });
});

describe('setup and failure paths', () => {
  it('marks SoundCloud channels and reuses explicit prefs when queueing all', async () => {
    const deps = makeDeps();
    const prefs = { quality: '320k' };
    invoke.mockResolvedValueOnce(SUB);
    const actions = createOnlineSubscriptionActions(deps);

    await actions.followChannelWithSetup(
      { ...CHANNEL, platform: 'soundcloud' },
      { prefs, downloadAll: true }
    );

    const input = invoke.mock.calls[0][1] as { platform: string };
    expect(input.platform).toBe('soundcloud');
    expect(deps.queueChannelVideos).toHaveBeenCalledWith('UC1', prefs, true);
  });

  it('does not queue when the subscription was not created', async () => {
    const deps = makeDeps();
    invoke.mockResolvedValueOnce(null);
    const actions = createOnlineSubscriptionActions(deps);

    await actions.followChannelWithSetup(CHANNEL, { downloadAll: true });

    expect(deps.queueChannelVideos).not.toHaveBeenCalled();
  });

  it('swallows errors while following with setup', async () => {
    const deps = makeDeps();
    invoke.mockRejectedValueOnce(new Error('nope'));
    const actions = createOnlineSubscriptionActions(deps);

    await expect(
      actions.followChannelWithSetup(CHANNEL, { downloadAll: false })
    ).resolves.toBeUndefined();
    expect(deps.addSubscription).not.toHaveBeenCalled();
  });

  it('swallows a failed restore from the undo toast', async () => {
    const deps = makeDeps();
    deps.getSubscription.mockReturnValue(SUB);
    invoke.mockResolvedValueOnce(true);
    const actions = createOnlineSubscriptionActions(deps);
    await actions.unfollowChannel('UC1');

    invoke.mockRejectedValueOnce(new Error('locked'));
    useUIStore().notifications[0]!.action!.run();
    await new Promise((r) => setTimeout(r, 0));

    expect(deps.addSubscription).not.toHaveBeenCalled();
  });

  it('keeps the subscription when removal fails', async () => {
    const deps = makeDeps();
    deps.getSubscription.mockReturnValue(SUB);
    invoke.mockRejectedValueOnce(new Error('locked'));
    const actions = createOnlineSubscriptionActions(deps);

    await actions.unfollowChannel('UC1');

    expect(deps.removeSubscription).not.toHaveBeenCalled();
    expect(useUIStore().notifications).toHaveLength(0);
  });

  it('swallows preference update failures', async () => {
    const deps = makeDeps();
    const actions = createOnlineSubscriptionActions(deps);

    invoke.mockRejectedValueOnce(new Error('locked'));
    await actions.setAutoDownload('UC1', true);
    invoke.mockRejectedValueOnce(new Error('locked'));
    await actions.setDownloadPrefs('UC1', { quality: '720p' });

    expect(deps.addSubscription).not.toHaveBeenCalled();
  });

  it('ignores null IPC responses from follow, restore and updates', async () => {
    const deps = makeDeps();
    deps.getSubscription.mockReturnValue(SUB);
    const actions = createOnlineSubscriptionActions(deps);

    invoke.mockResolvedValueOnce(null);
    await actions.followChannel(CHANNEL);
    invoke.mockResolvedValueOnce(null);
    await actions.setAutoDownload('UC1', true);
    invoke.mockResolvedValueOnce(null);
    await actions.setDownloadPrefs('UC1', { quality: '720p' });

    invoke.mockResolvedValueOnce(true);
    await actions.unfollowChannel('UC1');
    invoke.mockResolvedValueOnce(null);
    useUIStore().notifications[0]!.action!.run();
    await new Promise((r) => setTimeout(r, 0));

    expect(deps.addSubscription).not.toHaveBeenCalled();
  });
});
