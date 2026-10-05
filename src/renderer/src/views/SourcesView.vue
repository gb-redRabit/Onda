<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import {
  RefreshCw,
  Loader2,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Download
} from '@lucide/vue';
import SourcesContent from '@renderer/components/sources/SourcesContent.vue';
import SourcesFilterBar from '@renderer/components/sources/SourcesFilterBar.vue';
import SourcesSidebar from '@renderer/components/sources/SourcesSidebar.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import { useSourcesView } from '@renderer/composables/useSourcesView';

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

const {
  sources,
  prompt,
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
  displayItems,
  activeSource,
  activeEndpoint,
  isPage,
  tableClickable,
  downloadable,
  currentUrl,
  isAuthError,
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
} = useSourcesView();
// `scrollRef` jest wiązany w template (`ref="scrollRef"`); jawna referencja
// zapobiega uznaniu przez vue-tsc, że jest nieużywane.
void scrollRef;
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
      @remove="onRemoveSource"
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

    <ExplorerPromptDialog
      :visible="prompt.promptVisible.value"
      :is-confirm="prompt.promptIsConfirm.value"
      :message="prompt.promptMessage.value"
      :value="prompt.promptValue.value"
      @update:value="prompt.promptValue.value = $event"
      @confirm="prompt.promptConfirm()"
      @cancel="prompt.promptCancel()"
    />
  </div>
</template>
