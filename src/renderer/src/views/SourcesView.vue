<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  HelpCircle,
  Download,
  Upload,
  Wifi,
  CheckCircle2,
  AlertCircle,
  X
} from '@lucide/vue';
import { useSourcesStore } from '@renderer/stores/sources';
import { buildSourceUrl } from '@renderer/utils/sourceUrl';
import SourceGuideModal from '@renderer/components/sources/SourceGuideModal.vue';
import type { MediaSource, SourceItem } from '@renderer/types/sources';
import SourceCard from '@renderer/components/sources/SourceCard.vue';
import SourcePageView from '@renderer/components/sources/SourcePageView.vue';
import SourceEditorDialog from '@renderer/components/sources/SourceEditorDialog.vue';
import SourceDetailModal from '@renderer/components/sources/SourceDetailModal.vue';

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
const toast = ref<{ msg: string; ok: boolean } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string, ok = true) {
  toast.value = { msg, ok };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 3500);
}

const displayItems = computed(() => {
  let list = sources.items;
  const f = filterText.value.trim().toLowerCase();
  if (f) {
    list = list.filter(
      (i) =>
        (i.title || '').toLowerCase().includes(f) || (i.subtitle || '').toLowerCase().includes(f)
    );
  }
  if (sortMode.value === 'titleAsc')
    list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  else if (sortMode.value === 'titleDesc')
    list = [...list].sort((a, b) => b.title.localeCompare(a.title));
  else if (sortMode.value === 'type') list = [...list].sort((a, b) => a.type.localeCompare(b.type));
  return list;
});

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
  return sources.activeSource?.endpoints.find((e) => e.id === id)?.name || id;
}

const currentUrl = computed(() => {
  const s = sources.activeSource;
  const e = sources.activeEndpoint;
  if (!s || !e) return '';
  return buildSourceUrl(s, e, {
    query: Object.keys(queryParams.value).length ? queryParams.value : undefined,
    page: sources.paginationMode === 'page' ? sources.currentPage : undefined,
    context: sources.context ?? undefined
  });
});

const queryParams = computed(() => {
  const out: Record<string, string> = {};
  for (const line of queryText.value.split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
});

watch(
  () => sources.currentPage,
  (v) => {
    pageInput.value = v;
  }
);

onMounted(async () => {
  if (!sources.isLoaded) await sources.loadSources();
  if (sources.activeSource) {
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
      res.ok ? t('sources.toastQueued') : t('sources.toastFailed', { err: res.error || 'unknown' }),
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

async function onTestSource() {
  if (!sources.activeSource) return;
  const res = await sources.testSource(sources.activeSource);
  showToast(
    res.success
      ? t('sources.testSourceOk')
      : t('sources.testSourceFail', { err: res.error || 'unknown' }),
    res.success
  );
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
  <div class="h-full flex">
    <div
      class="w-64 shrink-0 h-full flex flex-col border-r border-base-300 bg-base-200/[var(--glass-alpha)]"
    >
      <div class="flex items-center justify-between px-3 py-2.5 border-b border-base-300">
        <h2 class="text-sm font-semibold">{{ $t('sources.title') }}</h2>
        <div class="flex items-center gap-1">
          <button
            class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
            :title="$t('sources.exportSources')"
            @click="onExport"
          >
            <Upload :size="14" />
          </button>
          <button
            class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
            :title="$t('sources.importSources')"
            @click="onImport"
          >
            <Download :size="14" />
          </button>
          <button
            class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
            :title="$t('sources.guide.title')"
            @click="showGuide = true"
          >
            <HelpCircle :size="15" />
          </button>
          <button
            class="fx-noise p-1.5 fx-depth rounded-field text-primary hover:bg-primary/10 transition-colors"
            :title="$t('sources.addSource')"
            @click="openAdd"
          >
            <Plus :size="16" />
          </button>
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        <div
          v-for="s in sources.sources"
          :key="s.id"
          class="group flex items-center gap-2 px-2.5 py-2 rounded-field cursor-pointer transition-colors"
          :class="
            s.id === sources.activeSourceId
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-base-content/10'
          "
          @click="sources.setActive(s.id)"
        >
          <Globe v-if="!s.icon" :size="14" class="shrink-0" />
          <img
            v-else
            :src="s.icon"
            class="w-3.5 h-3.5 rounded-field object-cover shrink-0"
            alt=""
          />
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :class="{
              'bg-success': sources.testStatus[s.id]?.success,
              'bg-error': sources.testStatus[s.id] && !sources.testStatus[s.id].success,
              'bg-base-300': !sources.testStatus[s.id]
            }"
            :title="
              sources.testStatus[s.id]
                ? sources.testStatus[s.id].error || $t('sources.testSourceOk')
                : $t('sources.testNotRun')
            "
          />
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate">{{ s.name }}</p>
            <p class="text-[10px] text-base-content/50 truncate">
              {{ $t('sources.endpointCount', { n: s.endpoints.length }) }}
            </p>
          </div>
          <div class="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
            <button
              class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content"
              :title="$t('common.edit')"
              @click.stop="openEdit(s)"
            >
              <Pencil :size="12" />
            </button>
            <button
              class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-error"
              :title="$t('common.delete')"
              @click.stop="sources.deleteSource(s.id)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
        <p
          v-if="!sources.sources.length"
          class="text-xs text-base-content/50 px-2 py-4 text-center"
        >
          {{ $t('sources.emptyList') }}
        </p>
      </div>
    </div>

    <div class="flex-1 min-w-0 h-full flex flex-col">
      <div v-if="activeSource" class="flex flex-col h-full">
        <div class="flex items-center gap-2 px-4 py-2 border-b border-base-300 overflow-x-auto">
          <button
            v-if="sources.navStack.length"
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
            :title="$t('sources.back')"
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
            <span v-for="(entry, i) in sources.navStack" :key="i" class="flex items-center gap-1">
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
              @click="pageNext"
            >
              <ChevronRight :size="14" />
            </button>
          </div>
          <button
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
            :title="$t('sources.testSourceBtn')"
            :disabled="sources.loading"
            @click="onTestSource"
          >
            <Wifi :size="14" />
          </button>
          <button
            v-if="downloadable && !isPage && sources.items.length"
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :title="$t('sources.downloadAll')"
            :disabled="sources.loading || downloadingAll"
            @click="onDownloadAll(displayItems)"
          >
            <Loader2 v-if="downloadingAll" :size="14" class="animate-spin" />
            <Download v-else :size="14" />
          </button>
          <button
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :title="$t('sources.refresh')"
            :disabled="sources.loading"
            @click="refresh"
          >
            <Loader2 v-if="sources.loading" :size="14" class="animate-spin" />
            <RefreshCw v-else :size="14" />
          </button>
        </div>
        <div v-if="!isPage" class="flex items-center gap-2 px-4 py-1.5 border-b border-base-300">
          <input
            v-model="filterText"
            type="text"
            :placeholder="$t('sources.filterPlaceholder')"
            class="flex-1 min-w-0 px-2.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            v-model="sortMode"
            class="shrink-0 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            :title="$t('sources.sortBy')"
          >
            <option value="none">{{ $t('sources.sortNone') }}</option>
            <option value="titleAsc">{{ $t('sources.sortTitleAsc') }}</option>
            <option value="titleDesc">{{ $t('sources.sortTitleDesc') }}</option>
            <option value="type">{{ $t('sources.sortType') }}</option>
          </select>
        </div>
        <p
          v-if="currentUrl"
          class="px-4 py-1 text-[10px] font-mono text-base-content/50 truncate border-b border-base-300"
          :title="currentUrl"
        >
          {{ currentUrl }}
        </p>

        <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto">
          <p v-if="sources.lastError" class="text-xs text-error mb-3 px-4 flex items-center gap-2">
            <AlertCircle :size="12" class="shrink-0" />
            <span class="flex-1 truncate">{{ sources.lastError }}</span>
            <button
              v-if="isAuthError"
              class="fx-noise shrink-0 px-2 py-0.5 fx-depth rounded-field border border-error/40 text-error hover:bg-error/10 transition-colors"
              @click="openEdit(activeSource)"
            >
              {{ $t('sources.editSourceShortcut') }}
            </button>
          </p>
          <SourcePageView
            v-if="isPage && sources.items[0]"
            :item="sources.items[0]"
            :rows="sources.tableRows"
            :row-loading="sources.tableLoading"
            :row-clickable="tableClickable"
            :downloadable="downloadable"
            @row-click="onRowClick"
            @download="onDownload"
            @download-all="onDownloadAll"
          />
          <div v-else class="p-4">
            <div
              v-if="sources.items.length"
              class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
            >
              <SourceCard
                v-for="(item, i) in displayItems"
                :key="item.id || `${sources.activeEndpointId}-${i}`"
                :item="item"
                :downloading="downloadingItem === item"
                :downloadable="downloadable"
                @preview="onItemClick($event)"
                @download="onDownload"
              />
            </div>
            <div
              v-else-if="sources.loading && !sources.items.length"
              class="h-full flex flex-col items-center justify-center gap-2 text-base-content/50"
            >
              <Loader2 :size="32" class="animate-spin opacity-50" />
              <p class="text-sm">{{ $t('sources.refresh') }}...</p>
            </div>
            <div
              v-else-if="displayItems.length === 0 && filterText"
              class="h-full flex flex-col items-center justify-center gap-2 text-base-content/50"
            >
              <Globe :size="32" class="opacity-50" />
              <p class="text-sm">{{ $t('sources.noItems') }}</p>
            </div>
            <div
              v-else-if="!sources.loading"
              class="h-full flex flex-col items-center justify-center gap-2 text-base-content/50"
            >
              <Globe :size="32" class="opacity-50" />
              <p class="text-sm">{{ $t('sources.noItems') }}</p>
            </div>
            <button
              v-if="sources.hasMore && sources.items.length && sources.paginationMode !== 'page'"
              class="fx-noise mt-4 mx-auto block px-4 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
              :disabled="sources.loading"
              @click="sources.fetchMore()"
            >
              {{ $t('sources.loadMore') }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-else
        class="flex-1 flex flex-col items-center justify-center gap-3 text-base-content/50"
      >
        <Globe :size="40" class="opacity-50" />
        <p class="text-sm">{{ $t('sources.emptyList') }}</p>
        <button
          class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors"
          @click="openAdd"
        >
          {{ $t('sources.addFirstSource') }}
        </button>
      </div>
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
      @close="previewItem = null"
      @download="onDownload"
    />
    <SourceGuideModal v-if="showGuide" @close="showGuide = false" />
    <Teleport to="body">
      <div
        v-if="toast"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-100 flex items-center gap-2 px-4 py-2.5 rounded-box shadow-2xl border text-sm max-w-[80vw]"
        :class="
          toast.ok
            ? 'bg-base-100 border-success/40 text-base-content'
            : 'bg-base-100 border-error/40 text-base-content'
        "
      >
        <CheckCircle2 v-if="toast.ok" :size="16" class="text-success shrink-0" />
        <AlertCircle v-else :size="16" class="text-error shrink-0" />
        <span class="truncate">{{ toast.msg }}</span>
        <button
          class="fx-noise p-0.5 fx-depth rounded-field text-base-content/50 hover:text-base-content"
          @click="toast = null"
        >
          <X :size="14" />
        </button>
      </div>
    </Teleport>
  </div>
</template>
