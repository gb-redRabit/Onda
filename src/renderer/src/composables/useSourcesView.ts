import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSourcesStore } from '@renderer/stores/sources';
import {
  filterAndSortSourceItems,
  parseQueryLines,
  type SourceSortMode,
  type SourceViewMode
} from '@renderer/utils/sourcesView';
import { endpointNameOf, currentSourceUrl } from '@renderer/utils/sourceViewLogic';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import { useUIStore } from '@renderer/stores/ui';
import { usePlayerStore } from '@renderer/stores/player';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { buildSourceStreamTrack, isSourceItemPlayable } from '@renderer/utils/sourceStream';

// Logika widoku Źródeł wyodrębniona z `SourcesView.vue` (template renderuje
// wyłącznie zwrócony stan). Modalne komponenty pozostają w widoku.
export function useSourcesView() {
  const sources = useSourcesStore();
  const { t } = useI18n();
  const ui = useUIStore();
  const player = usePlayerStore();
  const prompt = usePromptDialog();

  const showEditor = ref(false);
  const showGuide = ref(false);
  const editingSource = ref<MediaSource | null>(null);
  const previewItem = ref<SourceItem | null>(null);
  const downloadingItem = ref<SourceItem | null>(null);
  const queryText = ref('');
  const pageInput = ref(1);
  const scrollRef = ref<HTMLElement | null>(null);
  const sortMode = ref<SourceSortMode>('none');
  const filterText = ref('');
  const downloadingAll = ref(false);
  // Tryb zaznaczania zbiorczego (checkboxy na kartach + pasek akcji zbiorczych).
  const selectMode = ref(false);
  const selectedIds = ref<Set<string>>(new Set());
  const lastSelectedId = ref<string | null>(null);

  // Prezentacja elementów pochodzi z konfiguracji poziomu (kreator źródła):
  //  - lista → `endpoint.view` (karty/galeria/kompakt/karuzela/player),
  //  - strona → `endpoint.table.view` (wiersze: tabela/galeria/kompakt/karuzela/player).
  const configuredViewMode = computed<SourceViewMode>(() => {
    const endpoint = sources.activeEndpoint;
    if (!endpoint) return 'cards';
    if (endpoint.type === 'page') {
      const table = endpoint.table?.view;
      return table && table !== 'table' ? table : 'cards';
    }
    return endpoint.view ?? 'cards';
  });

  // Runtime'owy przełącznik widoku (sesyjny) nadpisuje konfigurację poziomu.
  const runtimeView = ref<SourceViewMode | null>(null);
  const viewMode = computed<SourceViewMode>(() => runtimeView.value ?? configuredViewMode.value);

  function setRuntimeView(mode: SourceViewMode): void {
    runtimeView.value = runtimeView.value === mode ? null : mode;
  }

  // Stan paska kondycji aktywnego źródła (jawny string — patrz SourceHealthBar).
  const healthState = computed<'checking' | 'ok' | 'fail' | 'unknown'>(() => {
    const id = sources.activeSourceId;
    if (!id) return 'unknown';
    if (sources.checking[id]) return 'checking';
    const status = sources.testStatus[id];
    if (!status) return 'unknown';
    return status.success ? 'ok' : 'fail';
  });

  // Źródła używały lokalnego toastu widoku; przekieruj go przez globalną kolejkę
  // powiadomień, żeby cała aplikacja miała jeden system toastów (i jeden wygląd).
  function showToast(msg: string, ok = true): void {
    ui.notify(ok ? 'success' : 'error', msg);
  }

  // Usunięcie źródła jest nieodwracalne — pytamy o potwierdzenie i raportujemy
  // porażkę, zamiast po cichu zostawić wpis na liście.
  async function onRemoveSource(id: string): Promise<void> {
    const name = sources.sources.find((s) => s.id === id)?.name || id;
    const ok = await prompt.showConfirm(t('sources.deleteConfirm', { name }));
    if (!ok) return;
    const res = await sources.deleteSource(id);
    if (!res.ok) {
      showToast(t('sources.deleteFailed', { err: res.error || 'unknown' }), false);
    }
  }

  function onReorderSources(ids: string[]): void {
    void sources.reorderSources(ids);
  }

  const displayItems = computed(() =>
    filterAndSortSourceItems(sources.items, filterText.value, sortMode.value)
  );

  const selectedItems = computed(() =>
    displayItems.value.filter((item) => !!item.id && selectedIds.value.has(item.id))
  );
  const selectedCount = computed(() => selectedItems.value.length);

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

  // Shift zaznacza zakres od ostatnio klikniętej pozycji (w obrębie widocznej listy).
  function toggleSelect(item: SourceItem, event?: MouseEvent): void {
    if (!item.id) return;
    const next = new Set(selectedIds.value);
    if (event?.shiftKey && lastSelectedId.value && lastSelectedId.value !== item.id) {
      const list = displayItems.value;
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

  const activeSource = computed(() => sources.activeSource);
  const activeEndpoint = computed(() => sources.activeEndpoint);
  const isPage = computed(() => sources.activeEndpoint?.type === 'page');
  const tableClickable = computed(() => !!sources.activeEndpoint?.table?.childId);
  const downloadable = computed(
    () =>
      !!sources.activeEndpoint?.mapping?.fields?.mediaUrl ||
      !!sources.activeEndpoint?.mapping?.fields?.playerUrl
  );
  const queryParams = computed(() => parseQueryLines(queryText.value));

  // Wizualny builder zapytań: kontrolki dla stałych parametrów skonfigurowanych
  // w endpoincie. Wartość wpisana nadpisuje domyślną z `endpoint.params`.
  const paramKeys = computed(() => Object.keys(sources.activeEndpoint?.params ?? {}));
  const paramDefaults = computed(() => sources.activeEndpoint?.params ?? {});
  const builderValues = ref<Record<string, string>>({});

  function endpointName(id: string): string {
    return endpointNameOf(sources.activeSource, id);
  }

  const currentUrl = computed(() =>
    currentSourceUrl(sources.activeSource, sources.activeEndpoint, {
      query: Object.keys(queryParams.value).length ? queryParams.value : undefined,
      page: sources.paginationMode === 'page' ? sources.currentPage : undefined,
      context: sources.context ?? undefined
    })
  );

  const isAuthError = computed(() =>
    /401|403|api\s*key|unauthorized|forbidden/i.test(sources.lastError || '')
  );

  function scrollToTop() {
    nextTick(() => {
      scrollRef.value?.scrollTo({ top: 0 });
    });
  }

  function currentQuery(): Record<string, string> | undefined {
    const merged = { ...queryParams.value };
    for (const [key, value] of Object.entries(builderValues.value)) {
      if (value) merged[key] = value;
    }
    return Object.keys(merged).length ? merged : undefined;
  }

  function openAdd() {
    editingSource.value = null;
    showEditor.value = true;
  }

  function openEdit(source: MediaSource) {
    editingSource.value = source;
    showEditor.value = true;
  }

  function refresh() {
    sources.fetchItems(currentQuery()).then(scrollToTop);
  }

  function goToPage() {
    const n = Math.max(1, Math.floor(pageInput.value || 1));
    pageInput.value = n;
    sources.setPage(n).then(scrollToTop);
  }

  function pagePrev() {
    sources.setPage(sources.currentPage - 1).then(scrollToTop);
  }

  function pageNext() {
    sources.fetchMore().then(scrollToTop);
  }

  function onEndpointChange(id: string) {
    sources.setActive(sources.activeSourceId, id);
  }

  function onItemClick(item: SourceItem) {
    if (sources.activeEndpoint?.childId) {
      sources.openItem(item).then(scrollToTop);
    } else {
      previewItem.value = item;
    }
  }

  function onRowClick(row: SourceItem) {
    sources.openTableRow(row).then(scrollToTop);
  }

  // Odtwarzanie bez pobierania: element z bezpośrednim `mediaUrl` trafia do playerа
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

  async function onClearDownloaded(): Promise<void> {
    const ok = await sources.clearDownloaded();
    showToast(
      ok ? t('sources.toastUnmarkedAll') : t('sources.toastFailed', { err: 'unknown' }),
      ok
    );
  }

  // Wejście do źródła zawsze ponownie sprawdza połączenie: przycisk na pasku zniknął,
  // a wynik steruje kropką statusu na pasku bocznym (zielona/czerwona) oraz krótkim
  // stanem "sprawdzania", gdy żądanie jest w toku.
  function onSelectSource(id: string): void {
    sources.setActive(id);
    const src = sources.sources.find((s) => s.id === id);
    if (src) void sources.testSource(src);
  }

  async function onExport() {
    const res = (await window.api.invoke('sources:export')) as {
      success: boolean;
      canceled?: boolean;
    };
    if (!res.canceled) {
      if (res.success) {
        showToast(t('sources.exportOk'), true);
      } else {
        showToast(t('sources.toastFailed', { err: t('sources.importSources') }), false);
      }
    }
  }

  async function onImport() {
    const res = (await window.api.invoke('sources:import')) as {
      success: boolean;
      canceled?: boolean;
      count?: number;
    };
    if (!res.canceled) {
      if (res.success) {
        await sources.loadSources();
        showToast(t('sources.importOk', { n: res.count ?? 0 }));
      } else {
        showToast(t('sources.toastFailed', { err: t('sources.importSources') }), false);
      }
    }
  }

  watch(
    () => sources.currentPage,
    (v) => {
      pageInput.value = v;
    }
  );

  watch(
    () => [sources.activeSourceId, sources.activeEndpointId],
    async () => {
      clearSelection();
      runtimeView.value = null;
      builderValues.value = {};
      if (sources.activeSource) {
        await sources.fetchItems(currentQuery());
        scrollToTop();
      } else {
        sources.items = [];
      }
    }
  );

  onMounted(async () => {
    if (!sources.isLoaded) await sources.loadSources();
    if (sources.activeSource) {
      void sources.testSource(sources.activeSource);
      await sources.fetchItems(currentQuery());
    }
  });

  return {
    sources,
    prompt,
    // stan
    showEditor,
    showGuide,
    editingSource,
    previewItem,
    downloadingItem,
    queryText,
    pageInput,
    scrollRef,
    sortMode,
    filterText,
    downloadingAll,
    selectMode,
    selectedIds,
    selectedItems,
    selectedCount,
    viewMode,
    runtimeView,
    setRuntimeView,
    paramKeys,
    paramDefaults,
    builderValues,
    healthState,
    // computed
    displayItems,
    activeSource,
    activeEndpoint,
    isPage,
    tableClickable,
    downloadable,
    currentUrl,
    isAuthError,
    // akcje
    endpointName,
    scrollToTop,
    openAdd,
    openEdit,
    refresh,
    goToPage,
    pagePrev,
    pageNext,
    onEndpointChange,
    onItemClick,
    onRowClick,
    onPlayNow,
    onAddToQueue,
    toggleSelectMode,
    isSelected,
    toggleSelect,
    clearSelection,
    onBulkDownload,
    onBulkQueue,
    onBulkPlay,
    queueSourceItems,
    onDownload,
    onDownloadAll,
    onUnmarkDownloaded,
    onClearDownloaded,
    onSelectSource,
    onExport,
    onImport,
    onRemoveSource,
    onReorderSources
  };
}
