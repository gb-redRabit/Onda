<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';

// Nakładka na pasek postępu: podświetlony obszar A–B + dwa PRZECIĄGALNE znaczniki.
// Umieszczana wewnątrz elementu paska (position: relative), rozmiar = rozmiar paska.

const props = defineProps<{ duration: number }>();
const player = usePlayerStore();
const rootEl = ref<HTMLElement | null>(null);

const aPct = computed(() =>
  props.duration > 0 && player.abA !== null ? (player.abA / props.duration) * 100 : null
);
const bPct = computed(() =>
  props.duration > 0 && player.abB !== null ? (player.abB / props.duration) * 100 : null
);
const band = computed(() =>
  aPct.value !== null && bPct.value !== null
    ? { left: `${aPct.value}%`, width: `${Math.max(0, bPct.value - aPct.value)}%` }
    : null
);

let dragging: 'A' | 'B' | null = null;

function timeAt(e: PointerEvent): number {
  const el = rootEl.value;
  if (!el || props.duration <= 0) return 0;
  const rect = el.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  return ratio * props.duration;
}
function start(which: 'A' | 'B', e: PointerEvent) {
  e.stopPropagation();
  e.preventDefault();
  dragging = which;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!dragging) return;
  const t = timeAt(e);
  if (dragging === 'A') player.moveAbA(t);
  else player.moveAbB(t);
}
function end() {
  dragging = null;
}
</script>

<template>
  <div
    v-if="player.abA !== null"
    ref="rootEl"
    data-testid="ab-markers"
    class="absolute inset-0 pointer-events-none"
  >
    <div
      v-if="band"
      data-testid="ab-band"
      class="absolute top-0 bottom-0"
      :class="player.abActive ? 'bg-primary/40' : 'bg-primary/25'"
      :style="band"
    />
    <button
      v-if="aPct !== null"
      type="button"
      data-testid="ab-marker-a"
      class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-auto flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-content text-3xs font-bold shadow cursor-ew-resize"
      :style="{ left: aPct + '%' }"
      :aria-label="$t('playerView.abSetA')"
      @pointerdown="(e: PointerEvent) => start('A', e)"
      @pointermove="move"
      @pointerup="end"
      @pointercancel="end"
    >
      A
    </button>
    <button
      v-if="bPct !== null"
      type="button"
      data-testid="ab-marker-b"
      class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-auto flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-content text-3xs font-bold shadow cursor-ew-resize"
      :style="{ left: bPct + '%' }"
      :aria-label="$t('playerView.abSetB')"
      @pointerdown="(e: PointerEvent) => start('B', e)"
      @pointermove="move"
      @pointerup="end"
      @pointercancel="end"
    >
      B
    </button>
  </div>
</template>
