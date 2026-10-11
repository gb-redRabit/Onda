<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertCircle, Globe } from '@lucide/vue';
import SourcePageView from './SourcePageView.vue';
import SourceCarousel from './SourceCarousel.vue';
import SourcePlayerView from './SourcePlayerView.vue';
import SourceCompact from './SourceCompact.vue';
import SourceGrid from './SourceGrid.vue';
import SourceLightbox from './SourceLightbox.vue';
import Loader from '@renderer/components/layout/Loader.vue';
import type { SourceItem } from '@renderer/types/sources';
import type { SourceViewMode } from '@renderer/utils/sourcesView';
import EmptyState from '@renderer/components/ui/EmptyState.vue';

const props = defineProps<{
  error: string;
  isAuthError: boolean;
  isPage: boolean;
  viewMode: SourceViewMode;
  pageItem?: SourceItem;
  rows: SourceItem[];
  rowLoading: boolean;
  rowClickable: boolean;
  downloadable: boolean;
  items: SourceItem[];
  displayItems: SourceItem[];
  loading: boolean;
  filterText: string;
  hasMore: boolean;
  paginationMode: string;
  downloadingItem: SourceItem | null;
  downloadedIds: Set<string>;
  selectable?: boolean;
  selectedIds?: Set<string>;
}>();
const emit = defineEmits<{
  rowClick: [SourceItem];
  download: [SourceItem];
  downloadAll: [SourceItem[]];
  preview: [SourceItem];
  fetchMore: [];
  editSource: [];
  select: [SourceItem, MouseEvent];
  play: [SourceItem];
}>();

const { t } = useI18n();
// Indeks pozycji otwartej w lightboxie galerii (-1 = zamknięty).
const lightboxIndex = ref(-1);

function openLightbox(item: SourceItem): void {
  const i = props.displayItems.indexOf(item);
  if (i >= 0) lightboxIndex.value = i;
}

function onSelect(item: SourceItem, event: MouseEvent): void {
  emit('select', item, event);
}
</script>

<template>
  <p v-if="error" role="alert" class="text-xs text-error mb-3 px-4 flex items-center gap-2">
    <AlertCircle :size="12" class="shrink-0" />
    <span class="flex-1 truncate">{{ error }}</span>
    <button
      v-if="isAuthError"
      class="fx-noise shrink-0 px-2 py-0.5 fx-depth rounded-field border border-error/40 text-error hover:bg-error/10 transition-colors"
      @click="emit('editSource')"
    >
      {{ t('sources.editSourceShortcut') }}
    </button>
  </p>
  <SourcePageView
    v-if="isPage && pageItem"
    :item="pageItem"
    :rows="rows"
    :view-mode="viewMode"
    :row-loading="rowLoading"
    :row-clickable="rowClickable"
    :downloadable="downloadable"
    :downloaded="!!pageItem.id && downloadedIds.has(pageItem.id)"
    :selectable="selectable"
    :selected-ids="selectedIds"
    @row-click="emit('rowClick', $event)"
    @select="onSelect"
    @download="emit('download', $event)"
    @download-all="emit('downloadAll', $event)"
  />
  <div v-else class="h-full min-h-0">
    <SourceCarousel
      v-if="displayItems.length && viewMode === 'carousel'"
      :items="displayItems"
      :downloadable="downloadable"
      :downloaded-ids="downloadedIds"
      :downloading-item="downloadingItem"
      :selectable="selectable"
      :selected-ids="selectedIds"
      @activate="emit('preview', $event)"
      @download="emit('download', $event)"
      @select="onSelect"
    />
    <SourcePlayerView
      v-else-if="displayItems.length && viewMode === 'player'"
      class="h-full"
      :items="displayItems"
      :downloadable="downloadable"
      :downloaded-ids="downloadedIds"
      :downloading-item="downloadingItem"
      :selectable="selectable"
      :selected-ids="selectedIds"
      @activate="emit('preview', $event)"
      @download="emit('download', $event)"
      @select="onSelect"
    />
    <SourceCompact
      v-else-if="displayItems.length && viewMode === 'compact'"
      class="p-4"
      :items="displayItems"
      :downloadable="downloadable"
      :downloaded-ids="downloadedIds"
      :downloading-item="downloadingItem"
      :selectable="selectable"
      :selected-ids="selectedIds"
      @activate="emit('preview', $event)"
      @download="emit('download', $event)"
      @select="onSelect"
    />
    <SourceGrid
      v-else-if="displayItems.length"
      :items="displayItems"
      :view-mode="viewMode"
      :downloadable="downloadable"
      :downloaded-ids="downloadedIds"
      :downloading-item="downloadingItem"
      :selectable="selectable"
      :selected-ids="selectedIds"
      @preview="emit('preview', $event)"
      @activate="openLightbox"
      @download="emit('download', $event)"
      @select="onSelect"
    />
    <div
      v-else-if="loading"
      class="h-full flex flex-col items-center justify-center gap-2 py-16 text-base-content/50"
    >
      <Loader :size="56" />
      <p class="text-sm">{{ t('sources.refresh') }}...</p>
    </div>
    <EmptyState
      v-else-if="!loading && filterText.trim()"
      :title="t('sources.noFilterResults')"
      :icon="Globe"
      class="py-16"
    />
    <EmptyState v-else-if="!loading" :title="t('sources.noItems')" :icon="Globe" class="py-16" />
    <button
      v-if="hasMore && items.length && paginationMode !== 'page'"
      class="fx-noise mt-4 mx-auto mb-4 block px-4 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
      :disabled="loading"
      @click="emit('fetchMore')"
    >
      {{ t('sources.loadMore') }}
    </button>
  </div>

  <SourceLightbox
    v-if="lightboxIndex >= 0"
    :items="displayItems"
    :index="lightboxIndex"
    :downloadable="downloadable"
    :downloaded-ids="downloadedIds"
    :downloading-item="downloadingItem"
    @update:index="lightboxIndex = $event"
    @close="lightboxIndex = -1"
    @download="emit('download', $event)"
    @play="emit('play', $event)"
  />
</template>
