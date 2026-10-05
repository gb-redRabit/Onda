<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance
} from 'vue';
import { useI18n } from 'vue-i18n';
import { useVirtualList } from '@renderer/composables/useVirtualList';
import { AlertCircle, Globe } from '@lucide/vue';
import SourceCard from './SourceCard.vue';
import SourcePageView from './SourcePageView.vue';
import Loader from '@renderer/components/layout/Loader.vue';
import type { SourceItem } from '@renderer/types/sources';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import EmptyState from '@renderer/components/ui/EmptyState.vue';

const props = defineProps<{
  error: string;
  isAuthError: boolean;
  isPage: boolean;
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
}>();
const emit = defineEmits<{
  rowClick: [SourceItem];
  download: [SourceItem];
  downloadAll: [SourceItem[]];
  preview: [SourceItem];
  fetchMore: [];
  editSource: [];
}>();

const { t } = useI18n();
const sourceGridRef = ref<HTMLElement | null>(null);
const sourceGrid = useVirtualGrid(sourceGridRef, 220, 5);
const sourceRows = useVirtualList({
  count: () => Math.ceil(props.displayItems.length / sourceGrid.cols.value),
  scrollEl: () => sourceGridRef.value,
  estimateSize: () => 260,
  overscan: 3
});
const visibleSourceRows = computed(() => {
  const columns = sourceGrid.cols.value;
  return sourceRows.value.getVirtualItems().map((row) => ({
    index: row.index,
    top: row.start,
    items: props.displayItems.slice(row.index * columns, (row.index + 1) * columns)
  }));
});

onMounted(() => sourceGrid.observe());
watch(
  () => props.displayItems.length,
  async (count) => {
    if (count && !props.isPage) {
      await nextTick();
      sourceGrid.observe();
    }
  }
);
watch(
  () => props.isPage,
  async (isPage) => {
    if (!isPage) {
      await nextTick();
      sourceGrid.observe();
    } else sourceGrid.destroy();
  }
);
onBeforeUnmount(() => sourceGrid.destroy());

function measureSourceRow(node: Element | ComponentPublicInstance | null): void {
  if (node instanceof HTMLElement) sourceRows.value.measureElement(node);
}
</script>

<template>
  <p v-if="error" class="text-xs text-error mb-3 px-4 flex items-center gap-2">
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
    :row-loading="rowLoading"
    :row-clickable="rowClickable"
    :downloadable="downloadable"
    :downloaded="!!pageItem.id && downloadedIds.has(pageItem.id)"
    @row-click="emit('rowClick', $event)"
    @download="emit('download', $event)"
    @download-all="emit('downloadAll', $event)"
  />
  <div v-else class="p-4">
    <div v-if="displayItems.length" ref="sourceGridRef">
      <div class="relative" :style="{ height: sourceRows.getTotalSize() + 'px' }">
        <div
          v-for="row in visibleSourceRows"
          :key="row.index"
          :ref="measureSourceRow"
          :data-index="row.index"
          class="absolute top-0 left-0 grid w-full gap-4 pb-4"
          :style="{
            transform: `translateY(${row.top}px)`,
            gridTemplateColumns: `repeat(${sourceGrid.cols.value}, minmax(0, 1fr))`
          }"
        >
          <SourceCard
            v-for="(item, i) in row.items"
            :key="item.id || `${row.index}-${i}`"
            :item="item"
            :downloading="downloadingItem === item"
            :downloadable="downloadable"
            :downloaded="!!item.id && downloadedIds.has(item.id)"
            @preview="emit('preview', $event)"
            @download="emit('download', $event)"
          />
        </div>
      </div>
    </div>
    <div
      v-else-if="loading"
      class="h-full flex flex-col items-center justify-center gap-2 text-base-content/50"
    >
      <Loader :size="56" />
      <p class="text-sm">{{ t('sources.refresh') }}...</p>
    </div>
    <EmptyState v-else-if="!loading" :title="t('sources.noItems')" :icon="Globe" />
    <button
      v-if="hasMore && items.length && paginationMode !== 'page'"
      class="fx-noise mt-4 mx-auto block px-4 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
      :disabled="loading"
      @click="emit('fetchMore')"
    >
      {{ t('sources.loadMore') }}
    </button>
  </div>
</template>
