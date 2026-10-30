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
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import { useVirtualList } from '@renderer/composables/useVirtualList';
import SourceCard from './SourceCard.vue';
import SourceGalleryTile from './SourceGalleryTile.vue';
import type { SourceItem } from '@renderer/types/sources';
import type { SourceViewMode } from '@renderer/utils/sourcesView';

// Zwirtualizowana siatka kart/galerii dla listy elementów poziomu.
const props = defineProps<{
  items: SourceItem[];
  viewMode: SourceViewMode;
  downloadable?: boolean;
  downloadedIds: Set<string>;
  downloadingItem: SourceItem | null;
  selectable?: boolean;
  selectedIds?: Set<string>;
}>();

// Typ elementu (IMAGE/WIDEO…) jest potrzebny tylko w mieszanej liście — przy
// samych obrazach badge tylko zaśmieca każdy kafelek.
const showType = computed(() => new Set(props.items.map((item) => item.type)).size > 1);
const emit = defineEmits<{
  preview: [SourceItem];
  download: [SourceItem];
  select: [SourceItem, MouseEvent];
  activate: [SourceItem];
}>();

const gridRef = ref<HTMLElement | null>(null);
// Galeria = większe kafelki (mniej kolumn), karty = gęsta siatka.
const grid = useVirtualGrid(gridRef, () => (props.viewMode === 'gallery' ? 260 : 220), 5);
const rows = useVirtualList({
  count: () => Math.ceil(props.items.length / grid.cols.value),
  scrollEl: () => gridRef.value,
  estimateSize: () => 260,
  overscan: 3
});
const visibleRows = computed(() => {
  const columns = grid.cols.value;
  return rows.value.getVirtualItems().map((row) => ({
    index: row.index,
    top: row.start,
    items: props.items.slice(row.index * columns, (row.index + 1) * columns)
  }));
});

onMounted(() => grid.observe());
watch(
  () => props.items.length,
  async (count) => {
    if (count) {
      await nextTick();
      grid.observe();
    }
  }
);
watch(
  () => props.viewMode,
  async (mode) => {
    if (mode === 'cards' || mode === 'gallery') {
      await nextTick();
      grid.observe();
    }
  }
);
onBeforeUnmount(() => grid.destroy());

function measureRow(node: Element | ComponentPublicInstance | null): void {
  if (node instanceof HTMLElement) rows.value.measureElement(node);
}
function onSelect(item: SourceItem, event: MouseEvent): void {
  emit('select', item, event);
}
</script>

<template>
  <div ref="gridRef" class="p-4">
    <div class="relative" :style="{ height: rows.getTotalSize() + 'px' }">
      <div
        v-for="row in visibleRows"
        :key="row.index"
        :ref="measureRow"
        :data-index="row.index"
        class="absolute top-0 left-0 grid w-full gap-4 pb-4"
        :style="{
          transform: `translateY(${row.top}px)`,
          gridTemplateColumns: `repeat(${grid.cols.value}, minmax(0, 1fr))`
        }"
      >
        <component
          :is="viewMode === 'gallery' ? SourceGalleryTile : SourceCard"
          v-for="(item, i) in row.items"
          :key="item.id || `${row.index}-${i}`"
          :item="item"
          :downloading="downloadingItem === item"
          :downloadable="downloadable"
          :downloaded="!!item.id && downloadedIds.has(item.id)"
          :selectable="selectable"
          :selected="!!item.id && !!selectedIds?.has(item.id)"
          :show-type="showType"
          @preview="emit('preview', $event)"
          @activate="emit('activate', $event)"
          @download="emit('download', $event)"
          @select="onSelect"
        />
      </div>
    </div>
  </div>
</template>
