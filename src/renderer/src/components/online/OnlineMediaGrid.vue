<script setup lang="ts" generic="T">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance
} from 'vue';
import { useVirtualList } from '@renderer/composables/useVirtualList';

// Zwirtualizowana siatka kart online. Jest WŁASNYM kontenerem przewijania
// (`overflow-y-auto`), więc renderują się tylko widoczne wiersze — wcześniej
// `OnlineChannelView`/`OnlineResolvedPanel` montowały wszystkie karty naraz.
// Wiersze mają zmienną wysokość (rozwijane karty), więc mierzymy je przez
// `measureElement`. Liczba kolumn wynika z szerokości (min. `minCols`), więc ten
// komponent liczy ją sam zamiast `useVirtualGrid` (który wymusza min. 2 kolumny).
const props = withDefaults(
  defineProps<{
    items: readonly T[];
    /** Docelowa szerokość kolumny w px — z niej wyliczana jest liczba kolumn. */
    colWidth?: number;
    /** Minimalna liczba kolumn (np. 1 dla trybu listy). */
    minCols?: number;
    /** Wstępna wysokość wiersza (px); mierzona ponownie po zamontowaniu. */
    estimateRowHeight?: number;
    gapClass?: string;
    /** Poziomy padding kontenera w px (do wyliczenia kolumn). */
    paddingPx?: number;
  }>(),
  { colWidth: 300, minCols: 2, estimateRowHeight: 300, gapClass: 'gap-4', paddingPx: 32 }
);

const scrollRef = ref<HTMLElement | null>(null);
const cols = ref(props.minCols);
let observer: ResizeObserver | null = null;

function computeCols(): void {
  const el = scrollRef.value;
  if (!el) return;
  const inner = el.clientWidth - props.paddingPx;
  cols.value = Math.max(props.minCols, Math.floor(inner / props.colWidth));
}

const rows = useVirtualList({
  count: () => Math.ceil(props.items.length / cols.value),
  scrollEl: () => scrollRef.value,
  estimateSize: () => props.estimateRowHeight,
  overscan: 3
});
const visibleRows = computed(() => {
  const columns = cols.value;
  return rows.value.getVirtualItems().map((row) => ({
    index: row.index,
    top: row.start,
    items: props.items.slice(row.index * columns, (row.index + 1) * columns)
  }));
});

function observe(): void {
  observer?.disconnect();
  const el = scrollRef.value;
  if (!el) return;
  observer = new ResizeObserver(() => computeCols());
  observer.observe(el);
  computeCols();
}

onMounted(() => observe());
watch(
  () => props.items.length,
  async (count) => {
    if (count) {
      await nextTick();
      computeCols();
    }
  }
);
watch(
  () => [props.colWidth, props.minCols],
  () => nextTick(() => computeCols())
);
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

function measureRow(node: Element | ComponentPublicInstance | null): void {
  if (node instanceof HTMLElement) rows.value.measureElement(node);
}
</script>

<template>
  <div ref="scrollRef" class="min-h-0 overflow-y-auto px-4 pt-4 pb-4">
    <div class="relative" :style="{ height: rows.getTotalSize() + 'px' }">
      <div
        v-for="row in visibleRows"
        :key="row.index"
        :ref="measureRow"
        :data-index="row.index"
        class="absolute top-0 left-0 grid w-full"
        :class="gapClass"
        :style="{
          transform: `translateY(${row.top}px)`,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
        }"
      >
        <slot v-for="(item, i) in row.items" :key="i" :item="item" />
      </div>
    </div>
    <!-- Stopka (sentinel/paginacja) przewija się razem z listą. -->
    <slot name="footer" />
  </div>
</template>
