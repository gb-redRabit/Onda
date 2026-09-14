import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import type { OnlineConfigTarget } from '@renderer/utils/onlineConfigDialog';
import type { Subscription } from '@renderer/types/online';

// Transient dialog/inline-panel state for the Online view + the shared Escape
// handler (closes the topmost dialog, newest-first).
export function useOnlineDialogs(
  input: Ref<string>,
  prefsOpen: Ref<Subscription | null>,
  unfollowTarget: Ref<string | null>
) {
  const ui = useUIStore();
  const { t } = useI18n();

  const expandedSearchId = ref<string | null>(null);
  const expandedResolvedId = ref<string | null>(null);
  const configTarget = ref<OnlineConfigTarget>(null);

  function openWatchUrl(url: string) {
    // Legacy saved SC entries may resolve to a bare numeric id — no page URL.
    if (!/^https:/i.test(url)) {
      ui.notify('info', input.value || url, t('youtube.openUnavailable'));
      return;
    }
    window.open(url, '_blank', 'width=1100,height=700');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (expandedSearchId.value) expandedSearchId.value = null;
    if (expandedResolvedId.value) expandedResolvedId.value = null;
    // Close the topmost inline dialog, newest-first.
    if (configTarget.value) {
      configTarget.value = null;
      return;
    }
    if (prefsOpen.value) {
      prefsOpen.value = null;
      return;
    }
    if (unfollowTarget.value) {
      unfollowTarget.value = null;
    }
  }

  function toastAdded() {
    ui.notify('success', t('youtube.added'), undefined, 2000);
  }

  return {
    expandedSearchId,
    expandedResolvedId,
    configTarget,
    openWatchUrl,
    onKeydown,
    toastAdded
  };
}
