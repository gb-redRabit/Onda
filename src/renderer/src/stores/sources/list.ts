import { computed, ref } from 'vue';
import type { MediaSource } from '@renderer/types/sources';
import { computePaginationMode } from '@renderer/utils/sources-helpers';

// Source catalog (list + active selection) extracted from `stores/sources.ts`
// (plan 2.7). The store destructures the returned refs/actions back into the
// same names, so call sites elsewhere are unchanged. Cache invalidation after
// save/delete is glued in the store (navigation/test state lives in the other
// modules created later).
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

  async function deleteSource(id: string): Promise<{ ok: boolean; wasActive: boolean }> {
    const wasActive = activeSourceId.value === id;
    try {
      const list = (await window.api.invoke('sources:delete', id)) as MediaSource[];
      sources.value = list || [];
      if (wasActive) selectFirst();
      return { ok: true, wasActive };
    } catch {
      // non-fatal
      return { ok: false, wasActive: false };
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
    deleteSource
  };
}
