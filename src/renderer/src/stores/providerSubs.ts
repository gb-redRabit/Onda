import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { ProviderDetectResult, RemoteSubscription } from '@shared/types/providers';

// Subskrypcje LINKÓW providerów (trwałe, w JSON po stronie main). Ładowane leniwie;
// mutacje optymistyczne po potwierdzeniu z main.

export const useProviderSubsStore = defineStore('providerSubs', () => {
  const subs = ref<RemoteSubscription[]>([]);
  const loaded = ref(false);

  function upsert(sub: RemoteSubscription): void {
    const idx = subs.value.findIndex((s) => s.id === sub.id);
    if (idx >= 0) subs.value[idx] = sub;
    else subs.value.push(sub);
  }

  async function load(): Promise<void> {
    try {
      const list = (await window.api.invoke('providers:subs:list')) as RemoteSubscription[] | null;
      if (Array.isArray(list)) subs.value = list;
    } catch {
      /* niedostępne */
    }
    loaded.value = true;
  }

  async function add(url: string, title?: string): Promise<RemoteSubscription | null> {
    try {
      const sub = (await window.api.invoke('providers:subs:add', {
        url,
        title
      })) as RemoteSubscription | null;
      if (sub) upsert(sub);
      return sub;
    } catch {
      return null;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      const ok = (await window.api.invoke('providers:subs:remove', id)) as boolean;
      if (ok) subs.value = subs.value.filter((s) => s.id !== id);
      return ok;
    } catch {
      return false;
    }
  }

  async function check(id: string): Promise<RemoteSubscription | null> {
    try {
      const sub = (await window.api.invoke(
        'providers:subs:check',
        id
      )) as RemoteSubscription | null;
      if (sub) upsert(sub);
      return sub;
    } catch {
      return null;
    }
  }

  function isSubscribed(providerId: string, shareId: string): boolean {
    return subs.value.some((s) => s.providerId === providerId && s.ref.shareId === shareId);
  }

  // Sprawdza wszystkie linki (z wykrywaniem nowych pozycji) i podmienia listę.
  async function checkAll(): Promise<void> {
    try {
      const list = (await window.api.invoke('providers:subs:checkAll')) as
        RemoteSubscription[] | null;
      if (Array.isArray(list)) subs.value = list;
    } catch {
      /* sprawdzanie nie powiodło się */
    }
  }

  // Podmiana wygasłego linku: re-detekcja nowego URL → aktualizacja ref/url/status.
  async function replaceLink(id: string, url: string): Promise<RemoteSubscription | null> {
    try {
      const detected = (await window.api.invoke(
        'providers:detect',
        url
      )) as ProviderDetectResult | null;
      if (!detected) return null;
      const sub = (await window.api.invoke('providers:subs:update', id, {
        url,
        ref: detected.ref,
        status: 'ok',
        lastCheckedAt: Date.now()
      })) as RemoteSubscription | null;
      if (sub) upsert(sub);
      return sub;
    } catch {
      return null;
    }
  }

  return { subs, loaded, load, add, remove, check, checkAll, replaceLink, isSubscribed, upsert };
});
