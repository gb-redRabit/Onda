import { ref } from 'vue';
import type { YoutubeAuthStatus } from '@shared/types/ipc';

const status = ref<YoutubeAuthStatus>({ method: 'none', loggedIn: false });
let initialized = false;

// Współdzielony status auth między UI ustawień a paskiem statusu. Trzymany w zakresie
// modułu, więc oba komponenty obserwują ten sam reaktywny obiekt.
export function useYoutubeAuth() {
  async function refresh(): Promise<void> {
    try {
      status.value = await window.api.invoke('yt:authStatus');
    } catch {
      // zachowaj ostatnią znaną wartość
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!initialized) {
      initialized = true;
      await refresh();
    }
  }

  return { status, refresh, ensureLoaded };
}
