import { ref } from 'vue';
import type { YoutubeAuthStatus } from '@shared/types/ipc';

const status = ref<YoutubeAuthStatus>({ method: 'none', loggedIn: false });
let initialized = false;

// Shared auth status across the settings UI and the status bar. Kept module
// scope so both components observe the same reactive object.
export function useYoutubeAuth() {
  async function refresh(): Promise<void> {
    try {
      status.value = await window.api.invoke('yt:authStatus');
    } catch {
      // keep last known value
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
