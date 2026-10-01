import { ref, watch } from 'vue';
import type { ComputedRef } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import { logger } from '@shared/logger';
import { buildSourceDownloadInput } from '@renderer/utils/sourceDownload';

export interface SourcesDownloadsDeps {
  activeSource: ComputedRef<MediaSource | null>;
}

// Kolejkowanie pobierania elementu źródła (pojedynczy element + cała lista) wyodrębnione z
// `stores/sources.ts` (plan 2.7). Store destrukturyzuje zwrócone akcje
// z powrotem do tych samych nazw, więc miejsca wywołań gdzie indziej pozostają bez zmian.
export function createSourcesDownloads(deps: SourcesDownloadsDeps) {
  const { activeSource } = deps;
  const settings = useSettingsStore();

  // Id API elementów już pobranych dla aktywnego źródła. Trzymane jako świeży
  // Set przy każdej mutacji, więc Vue niezawodnie rerenderuje zależnych.
  const downloadedIds = ref<Set<string>>(new Set());

  async function loadDownloaded(sourceId: string): Promise<void> {
    if (!sourceId) {
      downloadedIds.value = new Set();
      return;
    }
    try {
      const ids = (await window.api?.invoke('sources:downloaded', sourceId)) as
        string[] | undefined;
      downloadedIds.value = new Set(ids ?? []);
    } catch (e) {
      logger.warn('sources', 'loadDownloaded failed', e);
      downloadedIds.value = new Set();
    }
  }

  function markDownloaded(itemId: string): void {
    if (!itemId || downloadedIds.value.has(itemId)) return;
    downloadedIds.value = new Set(downloadedIds.value).add(itemId);
  }

  // Przeładuj, gdy zmieni się aktywne źródło (także przy pierwszym rozwiązaniu).
  watch(
    () => activeSource.value?.id ?? null,
    (id) => void loadDownloaded(id ?? ''),
    { immediate: true }
  );

  // Pobieranie, które kończy się, gdy widok jest otwarty, od razu oznacza swój element.
  // Proces main już je zapisał, więc późniejsze pobranie pozostaje spójne.
  let subscribed = false;
  function subscribeDownloadProgress(): void {
    if (subscribed) return;
    subscribed = true;
    window.api?.on('yt:downloadProgress', (raw) => {
      const task = raw as {
        status?: string;
        source?: { sourceId?: string; sourceItemId?: string };
      };
      if (task?.status !== 'completed') return;
      const sourceId = task.source?.sourceId;
      const itemId = task.source?.sourceItemId;
      if (!sourceId || !itemId) return;
      if (activeSource.value?.id !== sourceId) return;
      markDownloaded(itemId);
    });
  }
  subscribeDownloadProgress();

  async function enqueueDownload(
    item: SourceItem,
    opts?: { outputDir?: string; addToLibrary?: boolean }
  ): Promise<{ ok: boolean; error?: string }> {
    const source = activeSource.value;
    const url = item.playerUrl || item.mediaUrl || item.sourceUrl;
    if (!url || !source) return { ok: false, error: 'No URL' };
    const baseDir =
      source.download?.outputDir?.trim() ||
      ((await window.api.invoke('sources:downloadDir')) as string);
    const input = buildSourceDownloadInput({
      item,
      source,
      baseDir,
      outputDir: opts?.outputDir,
      addToLibrary: opts?.addToLibrary,
      autoAddToLibrary: settings.download.autoAddDownloadFolder
    });
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
    downloadedIds,
    loadDownloaded,
    enqueueDownload,
    enqueueAll
  };
}
