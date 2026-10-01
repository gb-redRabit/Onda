<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
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

onMounted(() => {
  window.addEventListener('resize', updateArrows);
  void nextTick(updateArrows);
});

onUnmounted(() => window.removeEventListener('resize', updateArrows));
</script>

<template>
  <section class="mb-8" data-testid="home-shelf">
    <div class="flex items-center justify-between gap-3 mb-3">
      <h2 class="text-base font-semibold flex items-center gap-2 min-w-0">
        <component :is="icon" :size="16" class="text-primary shrink-0" />
        <span class="truncate">{{ title }}</span>
      </h2>
      <div class="flex items-center gap-1 shrink-0">
        <button
          v-if="canScrollLeft"
          class="p-1 rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :aria-label="$t('home.scrollLeft')"
          @click="scrollBy(-1)"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          v-if="canScrollRight"
          class="p-1 rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :aria-label="$t('home.scrollRight')"
          @click="scrollBy(1)"
        >
          <ChevronRight :size="16" />
        </button>
        <button
          v-if="seeAllLabel"
          class="text-xs text-primary hover:text-primary/90 font-medium transition-colors ml-1"
          @click="emit('seeAll')"
        >
          {{ seeAllLabel }}
        </button>
      </div>
    </div>
    <div
      ref="scroller"
      class="flex gap-3 overflow-x-auto pb-1 scroll-smooth"
      @scroll.passive="updateArrows"
    >
      <slot />
    </div>
  </section>
</template>
