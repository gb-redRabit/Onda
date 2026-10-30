<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';

const props = defineProps<{
  title: string;
  icon: Component;
  seeAllLabel?: string;
  /** Ponownie ocenia strzałki przewijania, gdy zmienia się zawartość półki. */
  itemCount: number;
}>();

const emit = defineEmits<{ (e: 'seeAll'): void }>();

const scroller = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

// Maski krawędzi pojawiają się tylko po tej stronie, po której jest co przewijać.
const fadeStyle = computed(() => ({
  '--shelf-fade-left': canScrollLeft.value ? '2.5rem' : '0px',
  '--shelf-fade-right': canScrollRight.value ? '2.5rem' : '0px'
}));

function updateArrows(): void {
  const el = scroller.value;
  if (!el) {
    canScrollLeft.value = false;
    canScrollRight.value = false;
    return;
  }
  canScrollLeft.value = el.scrollLeft > 4;
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
}

function scrollBy(direction: 1 | -1): void {
  const el = scroller.value;
  if (!el) return;
  el.scrollBy({ left: direction * Math.max(200, el.clientWidth * 0.8), behavior: 'smooth' });
}

watch(
  () => props.itemCount,
  () => void nextTick(updateArrows)
);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  window.addEventListener('resize', updateArrows);
  // Szerokość półki zmienia się też przy zwijaniu sidebara, bez zdarzenia resize okna.
  if (typeof ResizeObserver !== 'undefined' && scroller.value) {
    resizeObserver = new ResizeObserver(updateArrows);
    resizeObserver.observe(scroller.value);
  }
  void nextTick(updateArrows);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateArrows);
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <section data-testid="home-shelf">
    <div class="flex items-center justify-between gap-3 mb-2.5">
      <h2
        class="text-2xs font-semibold uppercase tracking-wider text-base-content/60 flex items-center gap-2 min-w-0"
      >
        <component :is="icon" :size="14" class="text-primary-text shrink-0" />
        <span class="truncate">{{ title }}</span>
      </h2>
      <div class="flex items-center gap-1 shrink-0">
        <button
          v-if="canScrollLeft"
          type="button"
          class="grid h-6 w-6 place-items-center rounded-field border border-base-300/80 bg-base-100 text-base-content/60 transition-colors hover:bg-base-content/8 hover:text-base-content"
          :aria-label="$t('home.scrollLeft')"
          @click="scrollBy(-1)"
        >
          <ChevronLeft :size="13" />
        </button>
        <button
          v-if="canScrollRight"
          type="button"
          class="grid h-6 w-6 place-items-center rounded-field border border-base-300/80 bg-base-100 text-base-content/60 transition-colors hover:bg-base-content/8 hover:text-base-content"
          :aria-label="$t('home.scrollRight')"
          @click="scrollBy(1)"
        >
          <ChevronRight :size="13" />
        </button>
        <button
          v-if="seeAllLabel"
          type="button"
          class="ml-1.5 text-xs font-medium text-primary-text transition-colors hover:text-primary-text/80"
          @click="emit('seeAll')"
        >
          {{ seeAllLabel }}
        </button>
      </div>
    </div>
    <div
      ref="scroller"
      class="shelf-scroller flex gap-3 overflow-x-auto pb-1 scroll-smooth"
      :style="fadeStyle"
      @scroll.passive="updateArrows"
    >
      <slot />
    </div>
  </section>
</template>
