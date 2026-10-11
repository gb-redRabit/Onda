import { computed, ref, type ComputedRef } from 'vue';
import type { SourceItem } from '@renderer/types/sources';
import { isSourceItemPlayable } from '@renderer/utils/sourceStream';

// Zaznaczanie zbiorcze w widoku Źródeł (karty/galeria/kompakt/karuzela/player oraz
// wiersze strony). `pool` to aktualna pula pozycji: elementy listy albo wiersze tabeli.
export function useSourcesSelection(pool: ComputedRef<SourceItem[]>) {
  const selectMode = ref(false);
  const selectedIds = ref<Set<string>>(new Set());
  const lastSelectedId = ref<string | null>(null);

  const selectedItems = computed(() =>
    pool.value.filter((item) => !!item.id && selectedIds.value.has(item.id))
  );
  const selectedCount = computed(() => selectedItems.value.length);
  // Ile zaznaczonych pozycji da się odtworzyć (tylko audio/wideo) — steruje akcjami kolejki/odtwórz.
  const selectedPlayableCount = computed(
    () => selectedItems.value.filter(isSourceItemPlayable).length
  );

  function clearSelection(): void {
    selectedIds.value = new Set();
    lastSelectedId.value = null;
  }

  function toggleSelectMode(): void {
    selectMode.value = !selectMode.value;
    if (!selectMode.value) clearSelection();
  }

  function isSelected(id?: string): boolean {
    return !!id && selectedIds.value.has(id);
  }

  // Shift zaznacza zakres od ostatnio klikniętej pozycji (w obrębie widocznej puli).
  function toggleSelect(item: SourceItem, event?: MouseEvent): void {
    if (!item.id) return;
    const next = new Set(selectedIds.value);
    if (event?.shiftKey && lastSelectedId.value && lastSelectedId.value !== item.id) {
      const list = pool.value;
      const from = list.findIndex((i) => i.id === lastSelectedId.value);
      const to = list.findIndex((i) => i.id === item.id);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        for (let i = lo; i <= hi; i++) {
          const id = list[i]?.id;
          if (id) next.add(id);
        }
        selectedIds.value = next;
        lastSelectedId.value = item.id;
        return;
      }
    }
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    selectedIds.value = next;
    lastSelectedId.value = item.id;
  }

  return {
    selectMode,
    selectedIds,
    selectedItems,
    selectedCount,
    selectedPlayableCount,
    clearSelection,
    toggleSelectMode,
    isSelected,
    toggleSelect
  };
}
