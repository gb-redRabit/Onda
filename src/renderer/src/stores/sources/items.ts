import { ref, type ComputedRef } from 'vue';
import type {
  MediaSource,
  SourceEndpoint,
  SourceItem,
  SourceFetchResult
} from '@renderer/types/sources';
import { toPlain } from '@renderer/utils/sources-helpers';

export interface SourcesItemsDeps {
  activeSource: ComputedRef<MediaSource | null>;
  activeEndpoint: ComputedRef<SourceEndpoint | null>;
  paginationMode: ComputedRef<'page' | 'cursor' | 'none'>;
  startPage: ComputedRef<number>;
}

// Page items + table rows state and fetching (first page, more, pagination)
// extracted from `stores/sources.ts` (plan 2.7). Navigation writes `context`;
// the store destructures the returned refs/actions back into the same names,
// so call sites elsewhere are unchanged.
export function createSourcesItems(deps: SourcesItemsDeps) {
  const { activeSource, activeEndpoint, paginationMode, startPage } = deps;
  const items = ref<SourceItem[]>([]);
  const loading = ref(false);
  const hasMore = ref(false);
  const nextFrom = ref<string | null>(null);
  const lastError = ref('');
  const currentPage = ref(1);
  const context = ref<unknown>(null);
  const tableRows = ref<SourceItem[]>([]);
  const tableLoading = ref(false);
  let loadId = 0;

  /** Czyści listę/tabelę przy zmianie źródła, endpointu lub poziomu. */
  function resetItems() {
    items.value = [];
    hasMore.value = false;
    nextFrom.value = null;
    tableRows.value = [];
    tableLoading.value = false;
  }

  async function fetchTableRows() {
    const source = activeSource.value;
    const endpoint = activeEndpoint.value;
    const table = endpoint?.table;
    if (!source || !endpoint || !table) return;
    const id = loadId;
    tableLoading.value = true;
    try {
      const rows = (await window.api.invoke(
        'sources:tableRows',
        toPlain(source),
        toPlain(endpoint),
        {
          context: toPlain(context.value)
        }
      )) as SourceItem[];
      if (id === loadId) tableRows.value = rows || [];
    } catch {
      if (id === loadId) tableRows.value = [];
    } finally {
      if (id === loadId) tableLoading.value = false;
    }
  }

  async function fetchItems(query?: Record<string, string>) {
    const source = activeSource.value;
    const endpoint = activeEndpoint.value;
    if (!source || !endpoint) {
      items.value = [];
      hasMore.value = false;
      return;
    }
    if (paginationMode.value === 'page') currentPage.value = startPage.value;
    nextFrom.value = null;
    tableRows.value = [];
    tableLoading.value = false;
    const id = ++loadId;
    loading.value = true;
    lastError.value = '';
    try {
      const res = (await window.api.invoke('sources:fetch', toPlain(source), toPlain(endpoint), {
        query,
        page: paginationMode.value === 'page' ? currentPage.value : undefined,
        context: toPlain(context.value)
      })) as SourceFetchResult;
      if (id !== loadId) return;
      items.value = res?.items || [];
      hasMore.value = !!res?.hasMore;
      nextFrom.value = res?.nextFrom ?? null;
      if (res?.error) lastError.value = res.error;
      if (endpoint.type === 'page' && endpoint.table && !res?.error) {
        await fetchTableRows();
      }
    } catch (e) {
      if (id !== loadId) return;
      lastError.value = e instanceof Error ? e.message : String(e);
      items.value = [];
    } finally {
      if (id === loadId) loading.value = false;
    }
  }

  async function fetchMore() {
    if (loading.value) return;
    const source = activeSource.value;
    const endpoint = activeEndpoint.value;
    if (!source || !endpoint) return;
    const id = ++loadId;
    loading.value = true;
    try {
      if (paginationMode.value === 'page') {
        currentPage.value += 1;
        const res = (await window.api.invoke('sources:fetch', toPlain(source), toPlain(endpoint), {
          page: currentPage.value,
          context: toPlain(context.value)
        })) as SourceFetchResult;
        if (id !== loadId) return;
        items.value = res?.items || [];
        hasMore.value = (res?.items?.length ?? 0) > 0;
        if (res?.error) lastError.value = res.error;
      } else {
        if (!nextFrom.value) return;
        const res = (await window.api.invoke('sources:fetch', toPlain(source), toPlain(endpoint), {
          pageToken: nextFrom.value,
          context: toPlain(context.value)
        })) as SourceFetchResult;
        if (id !== loadId) return;
        items.value.push(...(res?.items || []));
        hasMore.value = !!res?.hasMore;
        nextFrom.value = res?.nextFrom ?? null;
      }
    } finally {
      if (id === loadId) loading.value = false;
    }
  }

  async function setPage(n: number) {
    const next = Math.max(1, Math.floor(n));
    if (next === currentPage.value) return;
    currentPage.value = next;
    const source = activeSource.value;
    const endpoint = activeEndpoint.value;
    if (!source || !endpoint) return;
    const id = ++loadId;
    loading.value = true;
    try {
      const res = (await window.api.invoke('sources:fetch', toPlain(source), toPlain(endpoint), {
        page: next,
        context: toPlain(context.value)
      })) as SourceFetchResult;
      if (id !== loadId) return;
      items.value = res?.items || [];
      hasMore.value = (res?.items?.length ?? 0) > 0;
      nextFrom.value = null;
      if (res?.error) lastError.value = res.error;
    } catch (e) {
      if (id !== loadId) return;
      lastError.value = e instanceof Error ? e.message : String(e);
      items.value = [];
    } finally {
      if (id === loadId) loading.value = false;
    }
  }

  return {
    items,
    loading,
    hasMore,
    nextFrom,
    lastError,
    currentPage,
    context,
    tableRows,
    tableLoading,
    resetItems,
    fetchTableRows,
    fetchItems,
    fetchMore,
    setPage
  };
}
