import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProviderSubsStore } from '../providerSubs';
import type { RemoteSubscription } from '@shared/types/providers';

// Siatka regresyjna store subskrypcji linków renderera: ładowanie, dodawanie,
// usuwanie, sprawdzanie i wykrywanie subskrypcji. `window.api` mockowane.

const invoke = vi.fn();
beforeEach(() => {
  setActivePinia(createPinia());
  invoke.mockReset();
  (window as unknown as { api: unknown }).api = { invoke };
});

const SUB: RemoteSubscription = {
  id: 'sub-1',
  providerId: 'pikpak',
  ref: { provider: 'pikpak', shareId: 'SHARE1' },
  url: 'https://mypikpak.com/s/SHARE1',
  title: 'PikPak',
  addedAt: 1,
  status: 'ok'
};

describe('useProviderSubsStore', () => {
  it('loads subscriptions over IPC', async () => {
    invoke.mockResolvedValueOnce([SUB]);
    const store = useProviderSubsStore();
    await store.load();
    expect(invoke).toHaveBeenCalledWith('providers:subs:list');
    expect(store.subs).toHaveLength(1);
    expect(store.loaded).toBe(true);
  });

  it('adds a subscription and upserts it', async () => {
    invoke.mockResolvedValueOnce(SUB);
    const store = useProviderSubsStore();
    const sub = await store.add('https://mypikpak.com/s/SHARE1', 'PikPak');
    expect(invoke).toHaveBeenCalledWith('providers:subs:add', {
      url: 'https://mypikpak.com/s/SHARE1',
      title: 'PikPak'
    });
    expect(sub).toEqual(SUB);
    expect(store.subs).toHaveLength(1);
  });

  it('removes a subscription', async () => {
    invoke.mockResolvedValueOnce(true);
    const store = useProviderSubsStore();
    store.upsert(SUB);
    expect(await store.remove('sub-1')).toBe(true);
    expect(store.subs).toEqual([]);
  });

  it('checks a subscription and updates its status', async () => {
    invoke.mockResolvedValueOnce({ ...SUB, status: 'expired' });
    const store = useProviderSubsStore();
    store.upsert(SUB);
    await store.check('sub-1');
    expect(store.subs[0].status).toBe('expired');
  });

  it('checkAll replaces the list from the main store', async () => {
    invoke.mockResolvedValueOnce([{ ...SUB, newCount: 2 }]);
    const store = useProviderSubsStore();
    await store.checkAll();
    expect(invoke).toHaveBeenCalledWith('providers:subs:checkAll');
    expect(store.subs[0].newCount).toBe(2);
  });

  it('reports whether a provider + shareId is subscribed', () => {
    const store = useProviderSubsStore();
    store.upsert(SUB);
    expect(store.isSubscribed('pikpak', 'SHARE1')).toBe(true);
    expect(store.isSubscribed('pikpak', 'OTHER')).toBe(false);
  });

  it('replaces an expired link via detect + update', async () => {
    const store = useProviderSubsStore();
    store.upsert({ ...SUB, status: 'expired' });
    invoke.mockResolvedValueOnce({
      id: 'pikpak',
      label: 'PikPak',
      icon: 'pikpak',
      capabilities: {
        folders: true,
        thumbnails: true,
        anonymous: true,
        expiringLink: true,
        auth: 'none'
      },
      ref: { provider: 'pikpak', shareId: 'NEW' }
    });
    invoke.mockResolvedValueOnce({
      ...SUB,
      url: 'NEWURL',
      ref: { provider: 'pikpak', shareId: 'NEW' },
      status: 'ok'
    });
    const sub = await store.replaceLink('sub-1', 'NEWURL');
    expect(invoke).toHaveBeenNthCalledWith(1, 'providers:detect', 'NEWURL');
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      'providers:subs:update',
      'sub-1',
      expect.objectContaining({ url: 'NEWURL', status: 'ok' })
    );
    expect(sub?.status).toBe('ok');
    expect(store.subs[0].ref.shareId).toBe('NEW');
  });
});
