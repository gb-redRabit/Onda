<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import {
  RefreshCw,
  Loader2,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Download,
  CheckCheck,
  CheckSquare,
  ListPlus,
  Play,
  X
} from '@lucide/vue';
import SourcesContent from '@renderer/components/sources/SourcesContent.vue';
import SourcesFilterBar from '@renderer/components/sources/SourcesFilterBar.vue';
import SourcesQueryBuilder from '@renderer/components/sources/SourcesQueryBuilder.vue';
import SourcesSidebar from '@renderer/components/sources/SourcesSidebar.vue';
import SourceHealthBar from '@renderer/components/sources/SourceHealthBar.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
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
  selectMode,
  selectedIds,
  selectedCount,
  viewMode,
  paramKeys,
  paramDefaults,
  builderValues,
  healthState,
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
  onPlayNow,
  onAddToQueue,
  toggleSelectMode,
  toggleSelect,
  clearSelection,
  onBulkDownload,
  onBulkQueue,
  onBulkPlay,
  onDownload,
  onDownloadAll,
  onUnmarkDownloaded,
  onClearDownloaded,
  onSelectSource,
  onExport,
  onImport,
  onRemoveSource,
  onReorderSources
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
      @reorder="onReorderSources"
      @export-all="onExport"
      @import-all="onImport"
      @guide="showGuide = true"
    />

    <div class="flex-1 min-w-0 h-full flex flex-col">
      <div v-if="activeSource" data-testid="sources-detail" class="flex flex-col h-full">
        <div
          class="ui-page-toolbar flex items-center gap-2 px-4 py-2 border-b border-base-300 bg-base-100/(--glass-alpha) backdrop-blur overflow-x-auto"
        >
          <IconButton
            v-if="sources.navStack.length"
            :icon="ArrowLeft"
            :label="$t('sources.back')"
            class="shrink-0"
            :disabled="sources.loading"
            @click="sources.goBack().then(scrollToTop)"
          />
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
            <IconButton
              :icon="ChevronLeft"
              :label="$t('sources.prevPage')"
              :disabled="sources.currentPage <= sources.startPage"
              @click="pagePrev"
            />
            <input
              v-model.number="pageInput"
              type="number"
              min="1"
              class="w-14 px-1.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              :title="$t('sources.currentPage')"
              @change="goToPage"
            />
            <IconButton
              :icon="ChevronRight"
              :label="$t('sources.nextPage')"
              :disabled="sources.loading || !sources.hasMore"
              @click="pageNext"
            />
          </div>
          <IconButton
            v-if="downloadable && !isPage && sources.items.length"
            :label="$t('sources.downloadAll')"
            class="shrink-0"
            :disabled="sources.loading || downloadingAll"
            @click="onDownloadAll(displayItems)"
          >
            <Loader2 v-if="downloadingAll" :size="14" class="animate-spin" />
            <Download v-else :size="14" />
          </IconButton>
          <IconButton
            v-if="isPage ? sources.tableRows.length : sources.items.length"
            :icon="CheckSquare"
            :label="$t('sources.select')"
            class="shrink-0"
            :pressed="selectMode"
            @click="toggleSelectMode"
          />
          <IconButton
            v-if="sources.downloadedIds.size"
            :icon="CheckCheck"
            :label="$t('sources.clearDownloaded')"
            class="shrink-0"
            @click="onClearDownloaded"
          />
          <IconButton
            :label="$t('sources.refresh')"
            class="shrink-0"
            :disabled="sources.loading"
            @click="refresh"
          >
            <Loader2 v-if="sources.loading" :size="14" class="animate-spin" />
            <RefreshCw v-else :size="14" />
          </IconButton>
        </div>
        <SourceHealthBar
          :state="healthState"
          :error="sources.testStatus[sources.activeSourceId]?.error"
          :at="sources.testStatus[sources.activeSourceId]?.at"
          :ms="sources.testStatus[sources.activeSourceId]?.ms"
          :item-count="sources.items.length"
          :downloaded-count="sources.downloadedIds.size"
        />
        <SourcesFilterBar
          v-if="!isPage"
          v-model:filter-text="filterText"
          v-model:sort-mode="sortMode"
        />
        <SourcesQueryBuilder
          v-if="!isPage"
          v-model="builderValues"
          :keys="paramKeys"
          :defaults="paramDefaults"
        />
        <div
          v-if="selectMode"
          class="flex items-center gap-2 px-4 py-1.5 border-b border-base-300 bg-primary/10 text-xs"
        >
          <span class="text-base-content/70 shrink-0">{{
            $t('sources.selectedCount', { n: selectedCount })
          }}</span>
          <span class="flex-1" />
          <button
            class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/80 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :disabled="!selectedCount"
            :title="$t('sources.downloadAll')"
            @click="onBulkDownload"
          >
            <Download :size="12" />
            {{ $t('sources.downloadAll') }}
          </button>
          <button
            class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/80 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :disabled="!selectedCount"
            :title="$t('sources.addToQueue')"
            @click="onBulkQueue"
          >
            <ListPlus :size="12" />
            {{ $t('sources.addToQueue') }}
          </button>
          <button
            class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/80 hover:bg-base-content/10 transition-colors disabled:opacity-50"
            :disabled="!selectedCount"
            :title="$t('sources.playNow')"
            @click="onBulkPlay"
          >
            <Play :size="12" />
            {{ $t('sources.playNow') }}
          </button>
          <IconButton
            :icon="X"
            :label="$t('sources.clearSelection')"
            class="shrink-0"
            @click="clearSelection"
          />
        </div>
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
            :view-mode="viewMode"
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
            :selectable="selectMode"
            :selected-ids="selectedIds"
            @row-click="onRowClick"
            @download="onDownload"
            @download-all="onDownloadAll"
            @preview="onItemClick"
            @select="toggleSelect"
            @play="onPlayNow"
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
      @unmark="onUnmarkDownloaded"
      @play="onPlayNow"
      @queue="onAddToQueue"
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
