<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  RefreshCw,
  Loader2,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Download
} from '@lucide/vue';
import { useSourcesStore } from '@renderer/stores/sources';
import { filterAndSortSourceItems, parseQueryLines } from '@renderer/utils/sourcesView';
import { endpointNameOf, currentSourceUrl } from '@renderer/utils/sourceViewLogic';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import SourcesContent from '@renderer/components/sources/SourcesContent.vue';
import SourcesFilterBar from '@renderer/components/sources/SourcesFilterBar.vue';
import SourcesSidebar from '@renderer/components/sources/SourcesSidebar.vue';
import { useUIStore } from '@renderer/stores/ui';
import EmptyState from '@renderer/components/ui/EmptyState.vue';

// Modale są leniwe — montowane tylko na żądanie (plan 3.5).
const SourceGuideModal = defineAsyncComponent(
  () => import('@renderer/components/sources/SourceGuideModal.vue')
);
const SourceEditorDialog = defineAsyncComponent(
  () => import('@renderer/components/sources/SourceEditorDialog.vue')
);
const SourceDetailModal = defineAsyncComponent(
  () => import('@renderer/components/sources/SourceDetailModal.vue')
);

const sources = useSourcesStore();
const { t } = useI18n();

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
const ui = useUIStore();
// Źródła używały lokalnego toastu widoku; przekieruj go przez globalną kolejkę
// powiadomień, żeby cała aplikacja miała jeden system toastów (i jeden wygląd).
function showToast(msg: string, ok = true): void {
  ui.notify(ok ? 'success' : 'error', msg);
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

function endpointName(id: string): string {
  return endpointNameOf(sources.activeSource, id);
}

const currentUrl = computed(() => {
  return currentSourceUrl(sources.activeSource, sources.activeEndpoint, {
    query: Object.keys(queryParams.value).length ? queryParams.value : undefined,
    page: sources.paginationMode === 'page' ? sources.currentPage : undefined,
    context: sources.context ?? undefined
  });
});

const queryParams = computed(() => parseQueryLines(queryText.value));

watch(
  () => sources.currentPage,
  (v) => {
    pageInput.value = v;
  }
);

onMounted(async () => {
  if (!sources.isLoaded) await sources.loadSources();
  if (sources.activeSource) {
    void sources.testSource(sources.activeSource);
    await sources.fetchItems(Object.keys(queryParams.value).length ? queryParams.value : undefined);
  }
});

watch(
  () => [sources.activeSourceId, sources.activeEndpointId],
  async () => {
    if (sources.activeSource) {
      await sources.fetchItems(
        Object.keys(queryParams.value).length ? queryParams.value : undefined
      );
      scrollToTop();
    } else {
      sources.items = [];
    }
  }
);

function openAdd() {
  editingSource.value = null;
  showEditor.value = true;
}

function openEdit(source: MediaSource) {
  editingSource.value = source;
  showEditor.value = true;
}

function scrollToTop() {
  nextTick(() => {
    scrollRef.value?.scrollTo({ top: 0 });
  });
}

function refresh() {
  sources
    .fetchItems(Object.keys(queryParams.value).length ? queryParams.value : undefined)
    .then(scrollToTop);
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

const isAuthError = computed(() =>
  /401|403|api\s*key|unauthorized|forbidden/i.test(sources.lastError || '')
);
</script>

<template>
  <div data-testid="sources-view" class="h-full flex">
    <SourcesSidebar
      :sources="sources.sources"
      :active-source-id="sources.activeSourceId"
      :test-status="sources.testStatus"
      :checking="sources.checking"
      @select="onSelectSource"
      @add="openAdd"
      @edit="openEdit"
      @remove="sources.deleteSource($event)"
      @export-all="onExport"
      @import-all="onImport"
      @guide="showGuide = true"
    />

    <div class="flex-1 min-w-0 h-full flex flex-col">
      <div v-if="activeSource" data-testid="sources-detail" class="flex flex-col h-full">
        <div
          class="ui-page-toolbar flex items-center gap-2 px-4 py-2 border-b border-base-300 overflow-x-auto"
        >
          <button
            v-if="sources.navStack.length"
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
            :title="$t('sources.back')"
            :aria-label="$t('sources.back')"
            :disabled="sources.loading"
            @click="sources.goBack().then(scrollToTop)"
          >
            <ArrowLeft :size="14" />
          </button>
          <select
            v-if="!sources.navStack.length"
            :value="sources.activeEndpointId"
            class="shrink-0 px-2.5 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            @change="onEndpointChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="e in activeSource.endpoints" :key="e.id" :value="e.id">
              {{ e.name }}
            </option>
          </select>
          <div v-else class="shrink-0 flex items-center gap-1 text-xs">
            <span
              v-for="(entry, i) in sources.navStack"
              :key="`${entry.endpointId}\u0000${i}`"
              class="flex items-center gap-1"
            >
              <button
                class="text-base-content/50 hover:text-base-content/70 transition-colors"
                :disabled="sources.loading"
                @click="sources.goBackTo(i).then(scrollToTop)"
              >
                {{ endpointName(entry.endpointId) }}
              </button>
              <span class="text-base-content/50">/</span>
            </span>
            <span class="text-primary font-medium">{{ activeEndpoint?.name }}</span>
          </div>
          <input
            v-model="queryText"
            type="text"
            :placeholder="$t('sources.queryParams')"
            class="flex-1 min-w-0 px-2.5 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div v-if="sources.paginationMode === 'page'" class="flex items-center gap-1 shrink-0">
            <button
              class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-40"
              :disabled="sources.currentPage <= sources.startPage"
              :title="$t('sources.prevPage')"
              :aria-label="$t('sources.prevPage')"
              @click="pagePrev"
            >
              <ChevronLeft :size="14" />
            </button>
            <input
              v-model.number="pageInput"
              type="number"
              min="1"
              class="w-14 px-1.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              :title="$t('sources.currentPage')"
              @change="goToPage"
            />
            <button
              class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-40"
              :disabled="sources.loading || !sources.hasMore"
              :title="$t('sources.nextPage')"
              :aria-label="$t('sources.nextPage')"
              @click="pageNext"
            >
              <ChevronRight :size="14" />
            </button>
          </div>
          <button
            v-if="downloadable && !isPage && sources.items.length"
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :title="$t('sources.downloadAll')"
            :aria-label="$t('sources.downloadAll')"
            :disabled="sources.loading || downloadingAll"
            @click="onDownloadAll(displayItems)"
          >
            <Loader2 v-if="downloadingAll" :size="14" class="animate-spin" />
            <Download v-else :size="14" />
          </button>
          <button
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :title="$t('sources.refresh')"
            :aria-label="$t('sources.refresh')"
            :disabled="sources.loading"
            @click="refresh"
          >
            <Loader2 v-if="sources.loading" :size="14" class="animate-spin" />
            <RefreshCw v-else :size="14" />
          </button>
        </div>
        <div
          v-if="sources.activeSourceId && sources.checking[sources.activeSourceId]"
          class="px-4 py-1.5 text-xs text-warning flex items-center gap-2 border-b border-base-300"
          data-testid="sources-checking"
        >
          <Loader2 :size="12" class="animate-spin" />
          {{ $t('sources.testChecking') }}
        </div>
        <SourcesFilterBar
          v-if="!isPage"
          v-model:filter-text="filterText"
          v-model:sort-mode="sortMode"
        />
        <p
          v-if="currentUrl"
          class="px-4 py-1 text-[10px] font-mono text-base-content/50 truncate border-b border-base-300"
          :title="currentUrl"
        >
          {{ currentUrl }}
        </p>

        <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto">
          <SourcesContent
            :error="sources.lastError"
            :is-auth-error="isAuthError"
            :is-page="isPage"
            :page-item="sources.items[0]"
            :rows="sources.tableRows"
            :row-loading="sources.tableLoading"
            :row-clickable="tableClickable"
            :downloadable="downloadable"
            :items="sources.items"
            :display-items="displayItems"
            :loading="sources.loading"
            :filter-text="filterText"
            :has-more="sources.hasMore"
            :pagination-mode="sources.paginationMode"
            :downloading-item="downloadingItem"
            :downloaded-ids="sources.downloadedIds"
            @row-click="onRowClick"
            @download="onDownload"
            @download-all="onDownloadAll"
            @preview="onItemClick"
            @fetch-more="sources.fetchMore()"
            @edit-source="openEdit(activeSource)"
          />
        </div>
      </div>

      <EmptyState v-else :title="$t('sources.emptyList')" :icon="Globe" class="m-auto">
        <button
          class="flex items-center gap-1.5 px-3 h-8 rounded-field text-xs font-medium bg-primary text-primary-content fx-depth"
          data-testid="sources-empty-add"
          @click="openAdd"
        >
          {{ $t('sources.addFirstSource') }}
        </button>
      </EmptyState>
    </div>

    <SourceEditorDialog
      v-if="showEditor"
      :source="editingSource"
      @close="showEditor = false"
      @saved="refresh"
    />
    <SourceDetailModal
      :item="previewItem"
      :downloadable="downloadable"
      :downloaded="!!previewItem?.id && sources.downloadedIds.has(previewItem.id)"
      @close="previewItem = null"
      @download="onDownload"
    />
    <SourceGuideModal v-if="showGuide" @close="showGuide = false" />
  </div>
</template>
