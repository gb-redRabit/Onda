import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOnlineSubscriptionActions } from '../subscriptionActions';
import type { Subscription } from '@renderer/types/online';

// Siatka regresyjna dla akcji subskrypcji renderera: obserwowanie/odobserwowanie,
// preferencje, ręczne sprawdzanie (z blokadą równoległości) i masowe kolejkowanie.

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  (window as unknown as { api: unknown }).api = { invoke };
});

function makeDeps() {
  return {
    addSubscription: vi.fn(),
    removeSubscription: vi.fn(),
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
});
