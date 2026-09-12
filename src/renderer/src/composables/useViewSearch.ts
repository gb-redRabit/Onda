import { watch } from 'vue';
import { useUIStore } from '@renderer/stores/ui';

export function useViewSearch(localQuery: { value: string }) {
  const ui = useUIStore();
  let syncing = false;

  watch(
    () => [ui.searchMode, ui.searchQuery] as const,
    ([mode, q]) => {
      if (syncing) return;
      if (mode === 'view' && localQuery.value !== q) {
        syncing = true;
        localQuery.value = q;
        syncing = false;
      }
    }
  );

  watch(
    () => localQuery.value,
    (q) => {
      if (syncing || ui.searchMode !== 'view') return;
      if (q === ui.searchQuery) return;
      syncing = true;
      ui.setSearchQuery(q);
      syncing = false;
    }
  );

  return { ui };
}
