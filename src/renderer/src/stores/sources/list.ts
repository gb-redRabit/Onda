import { computed, ref } from 'vue';
import type { MediaSource } from '@renderer/types/sources';
import { computePaginationMode } from '@renderer/utils/sources-helpers';

// Katalog źródeł (lista + aktywne wybory) wyodrębniony z `stores/sources.ts`
// (plan 2.7). Store destrukturyzuje zwrócone refy/akcje z powrotem do tych samych
// nazw, więc miejsca wywołań gdzie indziej pozostają bez zmian. Unieważnianie cache po
// zapisie/usunięciu jest sklejane w store (stan nawigacji/testu żyje w innych
// modułach tworzonych później).
export function createSourcesList() {
  const sources = ref<MediaSource[]>([]);
  const activeSourceId = ref('');
  const activeEndpointId = ref('');
  const isLoaded = ref(false);

  const activeSource = computed(
    () => sources.value.find((s) => s.id === activeSourceId.value) || null
  );
  const activeEndpoint = computed(
    () => activeSource.value?.endpoints.find((e) => e.id === activeEndpointId.value) || null
  );
  const paginationMode = computed<'page' | 'cursor' | 'none'>(() =>
    computePaginationMode(activeEndpoint.value)
  );
  const startPage = computed(() => activeEndpoint.value?.pagination?.pageStart ?? 1);

  function selectFirst() {
    const first = sources.value[0];
    activeSourceId.value = first?.id || '';
    activeEndpointId.value = first?.endpoints[0]?.id || '';
  }

  async function loadSources() {
    try {
      const list = (await window.api.invoke('sources:list')) as MediaSource[];
      sources.value = list || [];
      if (!activeSourceId.value && sources.value.length) selectFirst();
    } catch {
      sources.value = [];
    } finally {
      isLoaded.value = true;
    }
  }

  async function saveSource(
    source: MediaSource
  ): Promise<{ ok: boolean; error?: string; id?: string }> {
    try {
      const res = (await window.api.invoke('sources:save', source)) as {
        list: MediaSource[];
        saved: MediaSource | null;
        error?: string;
      };
      if (res?.list) sources.value = res.list;
      if (res?.saved) {
        activeSourceId.value = res.saved.id;
        activeEndpointId.value = res.saved.endpoints[0]?.id || '';
        return { ok: true, id: res.saved.id };
      }
      return { ok: false, error: res?.error || 'Invalid source' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function deleteSource(
    id: string
  ): Promise<{ ok: boolean; wasActive: boolean; error?: string }> {
    const wasActive = activeSourceId.value === id;
    try {
      const list = (await window.api.invoke('sources:delete', id)) as MediaSource[];
      sources.value = list || [];
      if (wasActive) selectFirst();
      return { ok: true, wasActive };
    } catch (e) {
      // Błąd zwracamy do widoku, żeby pokazał toast zamiast cicho połknąć porażkę.
      return { ok: false, wasActive: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Ustawia kolejność źródeł (lista id). Optymistycznie lokalnie + zapis w main. */
  async function reorderSources(ids: string[]): Promise<void> {
    const previous = sources.value;
    const byId = new Map(previous.map((s) => [s.id, s]));
    const optimistic = ids
      .map((id) => byId.get(id))
      .filter((s): s is MediaSource => !!s)
      .concat(previous.filter((s) => !ids.includes(s.id)));
    sources.value = optimistic;
    try {
      const list = (await window.api.invoke('sources:reorder', ids)) as MediaSource[];
      if (Array.isArray(list)) sources.value = list;
    } catch {
      // Fail-safe: przywróć poprzednią kolejność, jeśli zapis się nie powiódł.
      sources.value = previous;
    }
  }

  return {
    sources,
    activeSourceId,
    activeEndpointId,
    isLoaded,
    activeSource,
    activeEndpoint,
    paginationMode,
    startPage,
    loadSources,
    saveSource,
    deleteSource,
    reorderSources
  };
}
