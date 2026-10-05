import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';

/**
 * Zaznaczenie utworów w zakładce Utwory.
 *
 * Żyje w store (a nie lokalnie w `LibraryTracksTab`), aby menu kontekstowe —
 * otwierane globalnie przez `ui.showContextMenu` — mogło oznaczać/odznaczać
 * utwory z tego samego źródła prawdy. Zakładka synchronizuje i renderuje stan.
 */
export const useLibrarySelectionStore = defineStore('library-selection', () => {
  const selectedPaths = ref<Set<string>>(new Set());
  // Ostatni punkt zaczepienia dla Shift+klik (zakres). -1 = brak.
  const anchorPath = ref<string | null>(null);

  const count = computed(() => selectedPaths.value.size);
  const has = (path: string): boolean => selectedPaths.value.has(path);
  const paths = computed(() => [...selectedPaths.value]);

  function replaceWith(path: string): void {
    selectedPaths.value = new Set([path]);
    anchorPath.value = path;
  }

  function clear(): void {
    selectedPaths.value = new Set();
    anchorPath.value = null;
  }

  /** Przełącza pojedynczy utwór, zachowując resztę zaznaczenia. */
  function toggle(path: string): void {
    const next = new Set(selectedPaths.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selectedPaths.value = next;
    anchorPath.value = path;
  }

  /** Jawnie zaznacza (używane z menu kontekstowego). */
  function add(path: string): void {
    if (selectedPaths.value.has(path)) return;
    const next = new Set(selectedPaths.value);
    next.add(path);
    selectedPaths.value = next;
    anchorPath.value = path;
  }

  /** Jawnie odznacza (używane z menu kontekstowego). */
  function remove(path: string): void {
    if (!selectedPaths.value.has(path)) return;
    const next = new Set(selectedPaths.value);
    next.delete(path);
    selectedPaths.value = next;
  }

  /**
   * Zaznacza zakres w kolejności podanej listy (od ostatniego punktu zaczepienia
   * do `path`). Bez punktu zaczepienia zachowuje się jak pojedyncze zaznaczenie.
   */
  function selectRange(list: MediaFile[], path: string): void {
    const index = list.findIndex((t) => t.path === path);
    if (index < 0) return;
    const anchorIndex = anchorPath.value ? list.findIndex((t) => t.path === anchorPath.value) : -1;
    if (anchorIndex < 0) {
      replaceWith(path);
      return;
    }
    const start = Math.min(anchorIndex, index);
    const end = Math.max(anchorIndex, index);
    const next = new Set(selectedPaths.value);
    for (let i = start; i <= end; i++) next.add(list[i].path);
    selectedPaths.value = next;
  }

  return {
    selectedPaths,
    anchorPath,
    count,
    paths,
    has,
    replaceWith,
    clear,
    toggle,
    add,
    remove,
    selectRange
  };
});
