<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue';
import type { LibraryTab, TabId } from '@renderer/utils/libraryTabs';

// Pasek zakładek ze zwijaniem uwzględniającym szerokość (plan 6.3). Zamiast pozwalać etykietom
// być ucinanym (wielokropek), gdy okno jest zbyt wąskie, zakładki kurczą się płynnie:
// pełna etykieta + licznik -> ikona + licznik -> tylko ikona. Mierzone względem rzeczywistej
// dostępnej szerokości, więc dostosowuje się do dowolnego rozmiaru okna, długości liczników i
// przetłumaczonych etykiet.

const props = defineProps<{
  tabs: readonly LibraryTab[];
  modelValue: TabId;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TabId];
}>();

const tabRow = ref<HTMLDivElement>();
type TabMode = 'full' | 'compact' | 'icon';
const tabMode = ref<TabMode>('full');

function measureTabMode() {
  const row = tabRow.value;
  if (!row) return;
  const width = row.clientWidth;
  if (width <= 0) return;
  const buttons = Array.from(row.querySelectorAll<HTMLElement>('[data-tab]'));
  const labels = row.querySelectorAll<HTMLElement>('[data-tab-label]');
  const badges = row.querySelectorAll<HTMLElement>('[data-tab-count]');
  if (
    buttons.length !== props.tabs.length ||
    labels.length !== props.tabs.length ||
    badges.length !== props.tabs.length
  )
    return;

  // Naturalne (nieucięte) szerokości bieżącego układu, więc paddingi i
  // rzeczywisty odstęp między zakładkami pochodzą wprost z zastosowanego CSS.
  const contentW = buttons.map((b) => b.scrollWidth);
  const labelW = Array.from(labels, (l) => l.scrollWidth);
  const badgeW = Array.from(badges, (b) => b.offsetWidth);
  const gapPx = parseFloat(getComputedStyle(row).gap) || 4;
  const extras = gapPx * (props.tabs.length - 1) + 8; // odstępy między zakładkami + padding px-1 wiersza
  const weight = props.tabs.map((tabItem) => (tabItem.id === props.modelValue ? 1.2 : 1));
  const fullNeed = props.tabs.reduce((acc, _t, i) => acc + weight[i] * contentW[i], 0) + extras;
  const compactNeed = fullNeed - props.tabs.reduce((acc, _t, i) => acc + weight[i] * labelW[i], 0);
  const iconNeed = compactNeed - props.tabs.reduce((acc, _t, i) => acc + weight[i] * badgeW[i], 0);

  let nextMode: TabMode = tabMode.value;
  if (width < iconNeed) nextMode = 'icon';
  else if (width < compactNeed) nextMode = 'compact';
  else if (width >= fullNeed * 1.05) nextMode = 'full';
  if (nextMode !== tabMode.value) tabMode.value = nextMode;
}

let tabResizeObserver: ResizeObserver | null = null;
onMounted(() => {
  measureTabMode();
  if (typeof ResizeObserver !== 'undefined' && tabRow.value) {
    tabResizeObserver = new ResizeObserver(() => measureTabMode());
    tabResizeObserver.observe(tabRow.value);
  }
  document.fonts?.ready?.then(() => measureTabMode());
});
watch(
  () => props.tabs,
  () => nextTick(measureTabMode)
);
onUnmounted(() => tabResizeObserver?.disconnect());
</script>

<template>
  <div class="relative -mx-1" role="tablist" aria-label="Biblioteka">
    <div ref="tabRow" class="flex gap-1 sm:gap-1.5 px-1 pb-1 overflow-hidden" :data-mode="tabMode">
      <button
        v-for="tabItem in props.tabs"
        :key="tabItem.id"
        role="tab"
        data-tab
        :data-testid="'library-tab-' + tabItem.id"
        :aria-selected="props.modelValue === tabItem.id"
        :aria-label="tabItem.label"
        class="group flex flex-1 min-w-0 items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 rounded-field text-xs font-medium transition-all duration-150 border fx-depth hover:border-primary/30"
        :class="
          props.modelValue === tabItem.id
            ? 'bg-primary text-primary-content border-primary fx-depth shadow-primary/20 flex-[1.2] backdrop-blur-sm'
            : 'bg-base-100/(--glass-alpha) text-base-content/70 border-base-300 hover:bg-base-100/(--glass-alpha) hover:text-base-content backdrop-blur-sm'
        "
        :title="tabItem.label + ' (' + tabItem.count + ')'"
        @click="emit('update:modelValue', tabItem.id)"
      >
        <component
          :is="tabItem.icon"
          :size="14"
          class="shrink-0"
          :class="
            props.modelValue === tabItem.id ? 'opacity-90' : 'opacity-60 group-hover:opacity-100'
          "
        />
        <span data-tab-label class="truncate">{{ tabItem.label }}</span>
        <span
          data-tab-count
          class="ml-0.5 px-1 sm:px-1.5 py-0.5 rounded-selector text-[10px] font-bold leading-none shrink-0 border"
          :class="
            props.modelValue === tabItem.id
              ? 'bg-primary-content/20 text-primary-content border-primary-content/20'
              : 'bg-base-300 text-base-content/60 border-base-300'
          "
          >{{ tabItem.count }}</span
        >
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Zwijanie zakładek: 'compact' ukrywa etykietę tekstową, 'icon' ukrywa też licznik.
   Etykiety nigdy nie są ucinane wielokropkiem — są usuwane, gdy brakuje miejsca. Używana jest
   visibility (nie display), żeby układ pozostał stabilny, a pomiar szerokości
   nigdy nie oscylował. */
[data-mode='compact'] [data-tab-label],
[data-mode='icon'] [data-tab-label],
[data-mode='icon'] [data-tab-count] {
  visibility: hidden;
}
</style>
