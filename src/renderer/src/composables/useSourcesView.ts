import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSourcesStore } from '@renderer/stores/sources';
import { filterAndSortSourceItems, parseQueryLines } from '@renderer/utils/sourcesView';
import { endpointNameOf, currentSourceUrl } from '@renderer/utils/sourceViewLogic';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';

// Logika widoku Źródeł wyodrębniona z `SourcesView.vue` (template renderuje
// wyłącznie zwrócony stan). Modalne komponenty pozostają w widoku.
export function useSourcesView() {
  const sources = useSourcesStore();
  const { t } = useI18n();
  const ui = useUIStore();
  const prompt = usePromptDialog();

  const showEditor = ref(false);
  const showGuide = ref(false);
  const editingSource = ref<MediaSource | null>(null);
  const previewItem = ref<SourceItem | null>(null);
  const downloadingItem = ref<SourceItem | null>(null);
  const queryText = ref('');
  const pageInput = ref(1);
  const scrollRef = ref<HTMLElement | null>(null);
  const sortMode = ref<'none' | 'titleAsc' | 'titleDesc' | 'type'>('none');
  const filterText = ref('');
  const downloadingAll = ref(false);

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

  const displayItems = computed(() =>
    filterAndSortSourceItems(sources.items, filterText.value, sortMode.value)
  );

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
    return Object.keys(queryParams.value).length ? queryParams.value : undefined;
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
    onDownload,
    onDownloadAll,
    onSelectSource,
    onExport,
    onImport,
    onRemoveSource
  };
}
