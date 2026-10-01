import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { detectPlatform } from '@shared/platform';

// Konfiguracja na poziomie widoku: cache błędów awatara, globalny nasłuch Escape i
// prefill schowka przy montowaniu.
export function useOnlineViewSetup(input: Ref<string>, onKeydown: (e: KeyboardEvent) => void) {
  const yt = useOnlineStore();
  const { ensureLoaded: ensureProfilesLoaded } = useDownloadProfiles();
  const avatarErrors = ref<Record<string, boolean>>({});

  watch(
    () => yt.subscriptions.map((s) => s.channelThumbnail).join('|'),
    () => {
      avatarErrors.value = {};
    }
  );

  onMounted(async () => {
    window.addEventListener('keydown', onKeydown);
    try {
      const text = (await window.api?.invoke('app:readClipboard')) as string | undefined;
      if (typeof text === 'string' && detectPlatform(text) && !input.value) {
        input.value = text.trim();
      }
    } catch {
      /* schowek niedostępny */
    }
    void ensureProfilesLoaded();
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
  });

  return { avatarErrors };
}
