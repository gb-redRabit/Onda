import { ref, type Ref } from 'vue';
import { useSourcesStore } from '@renderer/stores/sources';
import { usePlayerStore } from '@renderer/stores/player';
import type { SourceItem } from '@renderer/types/sources';
import { buildSourceStreamTrack, isSourceItemPlayable } from '@renderer/utils/sourceStream';

// Akcje „na elementach" widoku Źródeł (odtwarzanie/kolejka/pobieranie/odznaczanie),
// wyodrębnione z `useSourcesView.ts` (plan 2.8). Zależą tylko od store'ów + kilku
// wstrzykniętych funkcji stanu widoku.

type SourcesStore = ReturnType<typeof useSourcesStore>;
type PlayerStore = ReturnType<typeof usePlayerStore>;
type Translate = (key: string, values?: Record<string, unknown>) => string;

export interface SourcesActionsDeps {
  sources: SourcesStore;
  player: PlayerStore;
  t: Translate;
  showToast: (msg: string, ok?: boolean) => void;
  selectedItems: Ref<SourceItem[]>;
  clearSelection: () => void;
  previewItem: Ref<SourceItem | null>;
}

export function useSourcesActions(deps: SourcesActionsDeps) {
  const { sources, player, t, showToast, selectedItems, clearSelection, previewItem } = deps;

  const downloadingItem = ref<SourceItem | null>(null);
  const downloadingAll = ref(false);

  // Odtwarzanie bez pobierania: element z bezpośrednim `mediaUrl` trafia do playera
  // jako strumień (silnik audio serwuje go przez lokalny proxy). `playerUrl` (embed)
  // obsługuje okno podglądu, nie ten tor.
  function queueSourceItems(items: SourceItem[]): number {
    const source = sources.activeSource;
    if (!source) return 0;
    const tracks = items
      .filter(isSourceItemPlayable)
      .map((item, i) => buildSourceStreamTrack(source, item, i));
    if (!tracks.length) return 0;
    player.addToQueueMultiple(tracks);
    return tracks.length;
  }

  function onPlayNow(item: SourceItem): void {
    const source = sources.activeSource;
    if (!source || !isSourceItemPlayable(item)) return;
    const track = buildSourceStreamTrack(source, item, 0);
    player.setTrack(track);
    player.enrichTrack(track);
    showToast(t('sources.nowPlaying', { title: track.name }));
  }

  function onAddToQueue(item: SourceItem): void {
    if (queueSourceItems([item])) showToast(t('sources.queueAddedOne'));
  }

  async function onBulkDownload(): Promise<void> {
    const list = selectedItems.value;
    if (!list.length) return;
    await onDownloadAll(list);
    clearSelection();
  }

  function onBulkQueue(): void {
    const n = queueSourceItems(selectedItems.value);
    if (n) showToast(t('sources.queueAdded', { n }));
  }

  function onBulkPlay(): void {
    const list = selectedItems.value.filter(isSourceItemPlayable);
    if (!list.length) return;
    onPlayNow(list[0]!);
    if (list.length > 1) queueSourceItems(list.slice(1));
  }

  async function onDownload(item: SourceItem) {
    downloadingItem.value = item;
    try {
      const res = await sources.enqueueDownload(item);
      showToast(
        res.ok
          ? t('sources.toastQueuedOne')
          : t('sources.toastFailed', { err: res.error || 'unknown' }),
        res.ok
      );
    } finally {
      downloadingItem.value = null;
    }
  }

  async function onDownloadAll(list: SourceItem[]) {
    downloadingAll.value = true;
    try {
      const res = await sources.enqueueAll(list);
      showToast(
        res.failed
          ? t('sources.toastQueuedSome', { q: res.queued, f: res.failed })
          : t('sources.toastQueued', { n: res.queued }),
        res.failed === 0
      );
    } finally {
      downloadingAll.value = false;
    }
  }

  // Odznaczenie „pobrane" jest trwałe (zapis w main) i aktualizuje zbiór w store.
  async function onUnmarkDownloaded(item: SourceItem): Promise<void> {
    if (!item.id) return;
    const ok = await sources.unmarkDownloaded(item.id);
    showToast(ok ? t('sources.toastUnmarked') : t('sources.toastFailed', { err: 'unknown' }), ok);
    if (ok) previewItem.value = null;
  }

  return {
    downloadingItem,
    downloadingAll,
    queueSourceItems,
    onPlayNow,
    onAddToQueue,
    onBulkDownload,
    onBulkQueue,
    onBulkPlay,
    onDownload,
    onDownloadAll,
    onUnmarkDownloaded
  };
}
