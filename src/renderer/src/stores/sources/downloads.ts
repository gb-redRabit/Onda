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
  // Token anty-wyścig: przy szybkiej zmianie aktywnego źródła A→B wolniejsza
  // odpowiedź dla A nie może nadpisać zbioru dla B.
  let loadId = 0;

  async function loadDownloaded(sourceId: string): Promise<void> {
    const id = ++loadId;
    if (!sourceId) {
      downloadedIds.value = new Set();
      return;
    }
    try {
      const ids = (await window.api?.invoke('sources:downloaded', sourceId)) as
        string[] | undefined;
      if (id !== loadId) return;
      downloadedIds.value = new Set(ids ?? []);
    } catch (e) {
      logger.warn('sources', 'loadDownloaded failed', e);
      if (id !== loadId) return;
      downloadedIds.value = new Set();
    }
  }

  function markDownloaded(itemId: string): void {
    if (!itemId || downloadedIds.value.has(itemId)) return;
    downloadedIds.value = new Set(downloadedIds.value).add(itemId);
  }

  /** Odznacza jeden element jako niepobrany (trwale, w main). */
  async function unmarkDownloaded(itemId: string): Promise<boolean> {
    const sourceId = activeSource.value?.id;
    if (!sourceId || !itemId) return false;
    try {
      const remaining = (await window.api.invoke('sources:unmarkDownloaded', sourceId, [
        itemId
      ])) as string[];
      downloadedIds.value = new Set(remaining ?? []);
      return true;
    } catch (e) {
      logger.warn('sources', 'unmarkDownloaded failed', e);
      return false;
    }
  }

  /** Czyści wszystkie oznaczenia „pobrane" dla aktywnego źródła. */
  async function clearDownloaded(): Promise<boolean> {
    const sourceId = activeSource.value?.id;
    if (!sourceId) return false;
    try {
      const remaining = (await window.api.invoke('sources:unmarkDownloaded', sourceId, [
        ''
      ])) as string[];
      downloadedIds.value = new Set(remaining ?? []);
      return true;
    } catch (e) {
      logger.warn('sources', 'clearDownloaded failed', e);
      return false;
    }
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

  /**
   * Kolejkuje wszystkie elementy z adresem w JEDNYM wywołaniu IPC.
   *
   * Wcześniej każde pobranie rozwiązywało `sources:downloadDir` i wołało
   * `sources:enqueue` osobno (2×N round-tripów). Handler `sources:enqueue` już
   * przyjmuje tablicę, a `sources:downloadDir` zwraca ten sam katalog dla całej
   * listy — więc katalog pobieramy raz i wysyłamy jedną partię.
   */
  async function enqueueAll(
    list: SourceItem[]
  ): Promise<{ queued: number; failed: number; errors: string[] }> {
    const source = activeSource.value;
    const items = list.filter((item) => item.playerUrl || item.mediaUrl || item.sourceUrl);
    if (!source || items.length === 0) return { queued: 0, failed: 0, errors: [] };

    let baseDir = source.download?.outputDir?.trim() || '';
    if (!baseDir) {
      try {
        baseDir = (await window.api.invoke('sources:downloadDir')) as string;
      } catch (e) {
        logger.warn('sources', 'enqueueAll: downloadDir failed', e);
      }
    }

    const inputs = items.map((item) =>
      buildSourceDownloadInput({
        item,
        source,
        baseDir,
        autoAddToLibrary: settings.download.autoAddDownloadFolder
      })
    );

    try {
      const created = (await window.api.invoke('sources:enqueue', inputs)) as Array<{
        id: string;
      }>;
      const queued = created?.length ?? 0;
      // Handler pomija nieprawidłowe wpisy zamiast przerywać całą partię — raportujemy
      // różnicę jako niepowodzenia, bez zgadywania, które konkretnie.
      const failed = Math.max(0, inputs.length - queued);
      return { queued, failed, errors: [] };
    } catch (e) {
      logger.warn('sources', 'enqueueAll failed', e);
      return {
        queued: 0,
        failed: inputs.length,
        errors: [e instanceof Error ? e.message : String(e)]
      };
    }
  }

  return {
    downloadedIds,
    loadDownloaded,
    enqueueDownload,
    enqueueAll,
    unmarkDownloaded,
    clearDownloaded
  };
}
