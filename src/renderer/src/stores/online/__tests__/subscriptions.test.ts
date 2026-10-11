import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOnlineSubscriptions } from '../subscriptions';
import type { Subscription } from '@renderer/types/online';

// Siatka regresyjna dla lokalnej kolekcji subskrypcji renderera: dodawanie/dedup,
// usuwanie, zapytania, oznaczanie pobranych (optymistyczne) i ładowanie przez IPC.

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  (window as unknown as { api: unknown }).api = { invoke };
});

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    channelId: 'UC1',
    channelTitle: 'Channel',
    channelThumbnail: '',
    autoDownload: true,
    addedAt: 1,
    ...overrides
  };
}

describe('createOnlineSubscriptions', () => {
  it('adds subscriptions and replaces an existing one for the same channelId', () => {
    const store = createOnlineSubscriptions();
    store.addSubscription(sub({ channelTitle: 'First' }));
    store.addSubscription(sub({ channelTitle: 'Second' }));
    expect(store.subscriptions.value).toHaveLength(1);
    expect(store.getSubscription('UC1')?.channelTitle).toBe('Second');
    expect(store.subscriptionsLoaded.value).toBe(true);
  });

  it('removes a subscription and answers queries', () => {
    const store = createOnlineSubscriptions();
    store.addSubscription(sub());
    expect(store.isSubscribed('UC1')).toBe(true);
    store.removeSubscription('UC1');
    expect(store.isSubscribed('UC1')).toBe(false);
    expect(store.getSubscription('UC1')).toBeUndefined();
  });

  it('reports whether a video is downloaded for a channel', () => {
    const store = createOnlineSubscriptions();
    store.addSubscription(sub({ downloadedVideoIds: ['v1'] }));
    expect(store.isVideoDownloaded('v1', 'UC1')).toBe(true);
    expect(store.isVideoDownloaded('v2', 'UC1')).toBe(false);
    expect(store.isVideoDownloaded('v1')).toBe(false); // brak channelId
  });

  it('markVideoDownloaded updates ids, drops it from queue and decrements pendingCount', () => {
    const store = createOnlineSubscriptions();
    store.addSubscription(sub({ queuedVideoIds: ['v1', 'v2'], pendingCount: 2 }));
    store.markVideoDownloaded('v1', 'UC1');
    const updated = store.getSubscription('UC1')!;
    expect(updated.downloadedVideoIds).toContain('v1');
    expect(updated.queuedVideoIds).toEqual(['v2']);
    expect(updated.pendingCount).toBe(1);
  });

  it('markVideoDownloaded is idempotent for an already-known video', () => {
    const store = createOnlineSubscriptions();
    store.addSubscription(sub({ downloadedVideoIds: ['v1'], pendingCount: 1 }));
    store.markVideoDownloaded('v1', 'UC1');
    expect(store.getSubscription('UC1')!.pendingCount).toBe(1);
  });

  it('markVideoDownloaded never drives pendingCount below zero', () => {
    const store = createOnlineSubscriptions();
    store.addSubscription(sub({ downloadedVideoIds: [], queuedVideoIds: ['v1'], pendingCount: 0 }));
    store.markVideoDownloaded('v1', 'UC1');
    expect(store.getSubscription('UC1')!.pendingCount).toBe(0);
  });

  it('loads subscriptions over IPC and marks them loaded', async () => {
    invoke.mockResolvedValueOnce([sub()]);
    const store = createOnlineSubscriptions();
    await store.loadSubscriptions();
    expect(invoke).toHaveBeenCalledWith('yt:subs:list');
    expect(store.subscriptions.value).toHaveLength(1);
    expect(store.subscriptionsLoaded.value).toBe(true);
  });

  it('keeps an empty list and marks loaded when the IPC call fails', async () => {
    invoke.mockRejectedValueOnce(new Error('offline'));
    const store = createOnlineSubscriptions();
    await store.loadSubscriptions();
    expect(store.subscriptions.value).toEqual([]);
    expect(store.subscriptionsLoaded.value).toBe(true);
  });
});
