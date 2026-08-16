import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useSettingsStore } from './settings';
import type {
  MediaSource,
  SourceEndpoint,
  SourceItem,
  SourceFetchResult
} from '@renderer/types/sources';
import type { IpcDownloadJobInput } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { applyPassKeys } from '@renderer/utils/sourceUrl';

function sanitizeName(name: string): string {
  return (
    name
      .replace(/\s*[\\/:*?"<>|]\s*/g, ' ')
      .trim()
      .slice(0, 180) || 'download'
  );
}

function deriveFileName(item: SourceItem): string {
  const url = item.mediaUrl || item.sourceUrl || '';
  const base = sanitizeName(item.title);
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot > 0 && last.length - dot <= 10) return `${base}${last.slice(dot).toLowerCase()}`;
  } catch {
    // not a URL
  }
  const fallback =
    item.type === 'image'
      ? 'jpg'
      : item.type === 'video'
        ? 'mp4'
        : item.type === 'audio'
          ? 'mp3'
          : 'bin';
  return `${base}.${fallback}`;
}

function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export const useSourcesStore = defineStore('sources', () => {
  const settings = useSettingsStore();
  const sources = ref<MediaSource[]>([]);
  const activeSourceId = ref('');
  const activeEndpointId = ref('');
  const items = ref<SourceItem[]>([]);
  const loading = ref(false);
  const hasMore = ref(false);
  const nextFrom = ref<string | null>(null);
  const lastError = ref('');
  const isLoaded = ref(false);
  const currentPage = ref(1);
  const context = ref<unknown>(null);
  const navStack = ref<Array<{ endpointId: string; context: unknown }>>([]);
  /** Pamięć nawigacji per źródło (przełączenie nie kasuje ścieżki). */
  const navBySource = ref<
    Record<string, { stack: Array<{ endpointId: string; context: unknown }>; endpointId: string; context: unknown }>
  >({});
  /** Wynik ostatniego testu połączenia per źródło (sesja). */
  const testStatus = ref<Record<string, { success: boolean; error?: string }>>({});
  const tableRows = ref<SourceItem[]>([]);
  const tableLoading = ref(false);
  let loadId = 0;

  const activeSource = computed(
    () => sources.value.find((s) => s.id === activeSourceId.value) || null
  );
  const activeEndpoint = computed(
    () => activeSource.value?.endpoints.find((e) => e.id === activeEndpointId.value) || null
  );
  const paginationMode = computed<'page' | 'cursor' | 'none'>(() =>
    activeEndpoint.value?.pagination?.pageParam && !activeEndpoint.value?.pagination?.nextFromField
      ? 'page'
      : activeEndpoint.value?.pagination?.nextFromField ||
          activeEndpoint.value?.pagination?.totalField
        ? 'cursor'
        : 'none'
  );
  const startPage = computed(() => activeEndpoint.value?.pagination?.pageStart ?? 1);

  function selectFirst() {
    const first = sources.value[0];
    activeSourceId.value = first?.id || '';
    activeEndpointId.value = first?.endpoints[0]?.id || '';
  }

  function setActive(sourceId: string, endpointId?: string) {
    if (sourceId !== activeSourceId.value) {
      // Zachowaj nawigację bieżącego źródła przed przełączeniem.
      if (activeSourceId.value) {
        navBySource.value[activeSourceId.value] = {
          stack: [...navStack.value],
          endpointId: activeEndpointId.value,
          context: context.value
        };
      }
      activeSourceId.value = sourceId;
      const saved = navBySource.value[sourceId];
      if (saved && saved.endpointId) {
        activeEndpointId.value = saved.endpointId;
        navStack.value = saved.stack;
        context.value = saved.context;
      } else {
        activeEndpointId.value =
          endpointId || sources.value.find((s) => s.id === sourceId)?.endpoints[0]?.id || '';
        navStack.value = [];
        context.value = null;
      }
      items.value = [];
      hasMore.value = false;
      nextFrom.value = null;
      currentPage.value = startPage.value;
      tableRows.value = [];
      tableLoading.value = false;
    } else if (endpointId && endpointId !== activeEndpointId.value) {
      activeEndpointId.value = endpointId;
      items.value = [];
      hasMore.value = false;
      nextFrom.value = null;
      currentPage.value = startPage.value;
      context.value = null;
      navStack.value = [];
      tableRows.value = [];
      tableLoading.value = false;
    }
  }

  async function openItem(item: SourceItem) {
    const endpoint = activeEndpoint.value;
    if (!endpoint?.childId) return;
    navStack.value.push({ endpointId: endpoint.id, context: context.value });
    activeEndpointId.value = endpoint.childId;
    context.value = applyPassKeys((item.extra ?? {}) as Record<string, unknown>, endpoint.passKeys);
    items.value = [];
    hasMore.value = false;
    nextFrom.value = null;
    currentPage.value = startPage.value;
    tableRows.value = [];
    tableLoading.value = false;
    await fetchItems();
  }

  /** Zejście z wiersza tabeli poziomu 'page': kontekst = strona + wiersz (wiersz nadpisuje),
   *  klucze z passKeys strony, potem passKeys tabeli (wiersz wygrywa). */
  async function openTableRow(row: SourceItem) {
    const endpoint = activeEndpoint.value;
    const table = endpoint?.table;
    if (!table?.childId || !endpoint) return;
    const pageCtx = (context.value ?? {}) as Record<string, unknown>;
    const rowCtx = (row.extra ?? {}) as Record<string, unknown>;
    const merged = { ...pageCtx, ...rowCtx };
    navStack.value.push({ endpointId: endpoint.id, context: context.value });
    activeEndpointId.value = table.childId;
    context.value = applyPassKeys(applyPassKeys(merged, endpoint.passKeys), table.passKeys);
    items.value = [];
    hasMore.value = false;
    nextFrom.value = null;
    currentPage.value = startPage.value;
    tableRows.value = [];
    tableLoading.value = false;
    await fetchItems();
  }

  async function goBackTo(depth: number) {
    const stack = navStack.value;
    if (depth < 0 || depth >= stack.length) return;
    const rootId = stack[0]?.endpointId;
    // depth = indeks wpisu w stacku, do którego wracamy: ostatni wpis to
    // endpoint, z którego przyszliśmy (goBack), a 0 = korzeń ścieżki.
    const entry = stack[depth];
    stack.splice(depth);
    activeEndpointId.value = entry ? entry.endpointId : (rootId ?? '');
    context.value = entry ? entry.context : null;
    items.value = [];
    hasMore.value = false;
    nextFrom.value = null;
    currentPage.value = startPage.value;
    tableRows.value = [];
    tableLoading.value = false;
    await fetchItems();
  }

  async function goBack() {
    await goBackTo(navStack.value.length - 1);
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

  async function saveSource(source: MediaSource): Promise<{ ok: boolean; error?: string }> {
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
        items.value = [];
        // Edycja unieważnia zapamiętaną nawigację i status testu.
        delete navBySource.value[res.saved.id];
        delete testStatus.value[res.saved.id];
      }
      return res?.saved ? { ok: true } : { ok: false, error: res?.error || 'Invalid source' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function deleteSource(id: string) {
    try {
      const list = (await window.api.invoke('sources:delete', id)) as MediaSource[];
      sources.value = list || [];
      delete navBySource.value[id];
      delete testStatus.value[id];
      if (activeSourceId.value === id) {
        selectFirst();
        items.value = [];
        hasMore.value = false;
        nextFrom.value = null;
        context.value = null;
        navStack.value = [];
        tableRows.value = [];
        tableLoading.value = false;
      }
    } catch {
      // non-fatal
    }
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

  async function testSource(
    source: MediaSource,
    endpoint?: SourceEndpoint
  ): Promise<{ success: boolean; error?: string; sample?: SourceItem | null }> {
    try {
      const res = (await window.api.invoke(
        'sources:test',
        toPlain(source),
        endpoint ? toPlain(endpoint) : null
      )) as {
        success: boolean;
        error?: string;
        sample?: SourceItem | null;
      };
      testStatus.value[source.id] = { success: res.success, error: res.error };
      return res;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      testStatus.value[source.id] = { success: false, error: err };
      return { success: false, error: err };
    }
  }

  async function tableRowsTest(
    source: MediaSource,
    endpoint: SourceEndpoint,
    context?: unknown
  ): Promise<SourceItem[]> {
    try {
      return (await window.api.invoke('sources:tableRows', toPlain(source), toPlain(endpoint), {
        context: toPlain(context)
      })) as SourceItem[];
    } catch {
      return [];
    }
  }

  async function enqueueDownload(
    item: SourceItem,
    opts?: { outputDir?: string; addToLibrary?: boolean }
  ): Promise<{ ok: boolean; error?: string }> {
    const source = activeSource.value;
    // Player (embed) ma pierwszeństwo — pobieranie przez yt-dlp (mega/cda/vk/drive).
    // mediaUrl to bezpośredni plik → tryb http (stream). sourceUrl tylko jako ostateczność.
    const url = item.playerUrl || item.mediaUrl || item.sourceUrl;
    const useYtdlp = !!item.playerUrl || (!item.mediaUrl && !!item.sourceUrl);
    if (!url || !source) return { ok: false, error: 'No URL' };
    const auth = source.auth;
    // Katalog docelowy: per-źródło (edycja w kreatorze), domyślnie <katalog Pobranych>/api.
    const prefs = source.download;
    const baseDir =
      prefs?.outputDir?.trim() || ((await window.api.invoke('sources:downloadDir')) as string);
    const outDir =
      prefs?.folder !== false && baseDir ? `${baseDir}/${sanitizeName(source.name)}` : baseDir;
    const input: IpcDownloadJobInput = {
      url,
      title: item.title || url,
      thumbnail: item.thumbnail,
      // yt-dlp: zawsze bestvideo+bestaudio/best — wideo zostaje wideo, samo-audio
      // i tak złapie selektor /best; bez re-encodingu. http (bezpośredni plik):
      // kind wyłącznie do nazwy pliku.
      kind: useYtdlp ? 'video' : item.type === 'video' ? 'video' : 'audio',
      format: 'best',
      quality: 'best',
      outputDir: opts?.outputDir ?? outDir,
      filenameTemplate: '{title}',
      addToLibrary: opts?.addToLibrary ?? settings.download.autoAddDownloadFolder,
      source: {
        mode: useYtdlp ? 'ytdlp' : 'http',
        fileName: useYtdlp ? undefined : deriveFileName(item),
        apiKeyId: auth && auth.type !== 'none' ? auth.apiKeyId : undefined,
        headerName: auth && auth.type === 'apikey' ? auth.headerName : undefined
      }
    };
    try {
      const created = (await window.api.invoke('sources:enqueue', [input])) as Array<{
        id: string;
      }>;
      return { ok: (created?.length ?? 0) > 0 };
    } catch (e) {
      logger.warn('sources', 'enqueueDownload failed', e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Kolejkuje wszystkie elementy z adresem (player/bezpośredni), sekwencyjnie. */
  async function enqueueAll(
    list: SourceItem[]
  ): Promise<{ queued: number; failed: number; errors: string[] }> {
    let queued = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const item of list) {
      if (!(item.playerUrl || item.mediaUrl || item.sourceUrl)) continue;
      const res = await enqueueDownload(item);
      if (res.ok) queued++;
      else {
        failed++;
        if (res.error && errors.length < 5) errors.push(`${item.title}: ${res.error}`);
      }
    }
    return { queued, failed, errors };
  }

  return {
    sources,
    activeSourceId,
    activeEndpointId,
    activeSource,
    activeEndpoint,
    paginationMode,
    currentPage,
    startPage,
    context,
    navStack,
    items,
    loading,
    hasMore,
    nextFrom,
    lastError,
    isLoaded,
    loadSources,
    saveSource,
    deleteSource,
    setActive,
    openItem,
    openTableRow,
    goBack,
    goBackTo,
    tableRows,
    tableLoading,
    testStatus,
    fetchItems,
    fetchMore,
    setPage,
    testSource,
    tableRowsTest,
    enqueueDownload,
    enqueueAll
  };
});
