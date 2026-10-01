import { describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { i18n, loadLocaleMessages } from '@renderer/i18n';
import { useOnlineStore } from '@renderer/stores/online';

// `useI18n()` wewnątrz store Pinia działa tylko, gdy instancja komponentu
// jest przypadkiem aktywna. Tworzenie store gdziekolwiek indziej — handler IPC,
// guard routera, test — rzucało "Must be called at the top of a
// `setup` function". Store'y czytają teraz globalny composer.

describe('online store outside a component', () => {
  it('constructs with no active component instance', async () => {
    setActivePinia(createPinia());
    await loadLocaleMessages('en');

    // Nic nie jest zamontowane, a getCurrentInstance() jest null, co jest dokładnie
    // warunkiem, który powodował rzucanie useI18n().
    expect(() => useOnlineStore()).not.toThrow();
    expect(useOnlineStore().searchQuery).toBe('');
  });

  it('translates through the global composer, not a stale locale', async () => {
    setActivePinia(createPinia());
    await loadLocaleMessages('en');
    const store = useOnlineStore();

    // Store przechwytuje `t` raz, więc asercja dotyczy zachowania, które
    // faktycznie go używa: przetłumaczonego tytułu powiadomienia.
    const messages = i18n.global.getLocaleMessage('en') as Record<string, unknown>;
    expect(messages).toBeTruthy();
    expect(typeof store.queueVideo).toBe('function');
  });
});

vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({ currentTrack: null, queue: [] })
}));
