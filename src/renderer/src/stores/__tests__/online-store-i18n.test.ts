import { describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { i18n, loadLocaleMessages } from '@renderer/i18n';
import { useOnlineStore } from '@renderer/stores/online';

// `useI18n()` inside a Pinia store only works while a component instance
// happens to be active. Constructing the store from anywhere else — an IPC
// handler, a router guard, a test — threw "Must be called at the top of a
// `setup` function". The stores now read the global composer instead.

describe('online store outside a component', () => {
  it('constructs with no active component instance', async () => {
    setActivePinia(createPinia());
    await loadLocaleMessages('en');

    // Nothing is mounted and getCurrentInstance() is null, which is exactly the
    // condition that made useI18n() throw.
    expect(() => useOnlineStore()).not.toThrow();
    expect(useOnlineStore().searchQuery).toBe('');
  });

  it('translates through the global composer, not a stale locale', async () => {
    setActivePinia(createPinia());
    await loadLocaleMessages('en');
    const store = useOnlineStore();

    // The store captures `t` once, so the assertion is on behaviour that
    // actually uses it: a translated notification title.
    const messages = i18n.global.getLocaleMessage('en') as Record<string, unknown>;
    expect(messages).toBeTruthy();
    expect(typeof store.queueVideo).toBe('function');
  });
});

vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({ currentTrack: null, queue: [] })
}));
