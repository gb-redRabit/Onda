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

function sanitizeName(name: string): string {
  return name.replace(/\s*[\\/:*?"<>|]\s*/g, ' ').trim().slice(0, 180) || 'download';
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
    item.type === 'image' ? 'jpg' : item.type === 'video' ? 'mp4' : item.type === 'audio' ? 'mp3' : 'bin';
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
  let loadId = 0;

  const activeSource = computed(
    () => sources.value.find((s) => s.id === activeSourceId.value) || null
  );
  const activeEndpoint = computed(
    () =>
      activeSource.value?.endpoints.find((e) => e.id === activeEndpointId.value) || null
  );

  function selectFirst() {
    const first = sources.value[0];
    activeSourceId.value = first?.id || '';
    activeEndpointId.value = first?.endpoints[0]?.id || '';
  }

  function setActive(sourceId: string, endpointId?: string) {
    if (sourceId !== activeSourceId.value) {
      activeSourceId.value = sourceId;
      activeEndpointId.value = endpointId || sources.value.find((s) => s.id === sourceId)?.endpoints[0]?.id || '';
      items.value = [];
      hasMore.value = false;
      nextFrom.value = null;
    } else if (endpointId && endpointId !== activeEndpointId.value) {
      activeEndpointId.value = endpointId;
      items.value = [];
      hasMore.value = false;
      nextFrom.value = null;
    }
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
      if (activeSourceId.value === id) {
        selectFirst();
        items.value = [];
        hasMore.value = false;
        nextFrom.value = null;
      }
    } catch {
      // non-fatal
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
    const id = ++loadId;
    loading.value = true;
    lastError.value = '';
    try {
      const res = (await window.api.invoke('sources:fetch', toPlain(source), toPlain(endpoint), {
        query
      })) as SourceFetchResult;
      if (id !== loadId) return;
      items.value = res?.items || [];
      hasMore.value = !!res?.hasMore;
      nextFrom.value = res?.nextFrom ?? null;
      if (res?.error) lastError.value = res.error;
    } catch (e) {
      if (id !== loadId) return;
      lastError.value = e instanceof Error ? e.message : String(e);
      items.value = [];
    } finally {
      if (id === loadId) loading.value = false;
    }
  }

  async function fetchMore() {
    if (loading.value || !nextFrom.value) return;
    const source = activeSource.value;
    const endpoint = activeEndpoint.value;
    if (!source || !endpoint) return;
    const id = ++loadId;
    loading.value = true;
    try {
      const res = (await window.api.invoke('sources:fetch', toPlain(source), toPlain(endpoint), {
        pageToken: nextFrom.value
      })) as SourceFetchResult;
      if (id !== loadId) return;
      items.value.push(...(res?.items || []));
      hasMore.value = !!res?.hasMore;
      nextFrom.value = res?.nextFrom ?? null;
    } finally {
      if (id === loadId) loading.value = false;
    }
  }

  async function testSource(
    source: MediaSource,
    endpoint?: SourceEndpoint
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return (await window.api.invoke('sources:test', toPlain(source), endpoint ? toPlain(endpoint) : null)) as {
        success: boolean;
        error?: string;
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async function enqueueDownload(
    item: SourceItem,
    opts?: { outputDir?: string; addToLibrary?: boolean }
  ): Promise<{ ok: boolean; error?: string }> {
    const source = activeSource.value;
    const url = item.mediaUrl || item.sourceUrl;
    if (!url || !source) return { ok: false, error: 'No URL' };
    const auth = source.auth;
    const input: IpcDownloadJobInput = {
      url,
      title: item.title || url,
      thumbnail: item.thumbnail,
      kind: item.type === 'video' ? 'video' : 'audio',
      format: 'best',
      quality: 'best',
      outputDir: opts?.outputDir ?? settings.download.defaultPath ?? '',
      filenameTemplate: '{title}',
      addToLibrary: opts?.addToLibrary ?? settings.download.autoAddDownloadFolder,
      source: {
        mode: 'http',
        fileName: deriveFileName(item),
        apiKeyId: auth && auth.type !== 'none' ? auth.apiKeyId : undefined,
        headerName: auth && auth.type === 'apikey' ? auth.headerName : undefined
      }
    };
    try {
      const created = (await window.api.invoke('sources:enqueue', [input])) as Array<{ id: string }>;
      return { ok: (created?.length ?? 0) > 0 };
    } catch (e) {
      logger.warn('sources', 'enqueueDownload failed', e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    sources,
    activeSourceId,
    activeEndpointId,
    activeSource,
    activeEndpoint,
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
    fetchItems,
    fetchMore,
    testSource,
    enqueueDownload
  };
});