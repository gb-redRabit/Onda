<script setup lang="ts">
import { computed } from 'vue';
import { usePipVisualizer } from './usePipVisualizer';
import { usePipAudioState } from './usePipAudioState';
import PipCardLayout from './PipCardLayout.vue';
import PipStackLayout from './PipStackLayout.vue';
import PipBarLayout from './PipBarLayout.vue';
import {
  PEEK_TRACK,
  PEEK_FILL,
  pipPeekAlign,
  pipPeekFillGeom,
  pipPeekFillState,
  pipPeekTrackGeom,
  pipRootClass
} from './pipTheme';

const handlers = { updateAccent: () => {} };
const state = usePipAudioState(handlers);
const viz = usePipVisualizer(state.vizData, state.isVertical);
handlers.updateAccent = viz.updateAccent;

const { isPlaying, dock, layoutKind, edge, peeked, has, progressPct, showMain, onProgressClick } =
  state;

function onRootDblClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest('button, input')) return;
  showMain();
}

const rootClass = computed(() => pipRootClass(dock.value, peeked.value, edge.value));
const peekAlign = computed(() => pipPeekAlign(edge.value));
const peekTrackGeom = computed(() => pipPeekTrackGeom(edge.value));
const peekFillGeom = computed(() => pipPeekFillGeom(edge.value));
const peekFillState = computed(() => pipPeekFillState(isPlaying.value));
</script>

<template>
  <div
    class="pip-fade-in relative box-border h-full w-full overflow-hidden"
    :class="rootClass"
    @dblclick="onRootDblClick"
  >
    <!-- ===== ZWINIĘTY (krawędź + auto-hide): sam pasek postępu na wystającej krawędzi ===== -->
    <div v-if="peeked && edge" class="flex h-full w-full" :class="peekAlign">
      <div
        class="group"
        :class="[PEEK_TRACK, peekTrackGeom]"
        @click="onProgressClick"
        @dblclick.stop
      >
        <div
          :class="[PEEK_FILL, peekFillGeom, peekFillState]"
          :style="
            edge === 'left' || edge === 'right'
              ? { height: progressPct + '%' }
              : { width: progressPct + '%' }
          "
        ></div>
      </div>
    </div>

    <template v-else>
      <!-- Wizualizacja w tle (jeśli włączona; na bokach obrócona o 90°) -->
      <canvas
        v-if="has('viz')"
        :ref="viz.setCanvas"
        class="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-40"
      ></canvas>

      <!-- ===== KARTA (rogi) ===== -->
      <PipCardLayout v-if="layoutKind === 'card'" :state="state" />

      <!-- ===== PASEK POZIOMY (top/bottom, pełna szerokość) ===== -->
      <PipBarLayout v-else-if="layoutKind === 'bar-h'" :state="state" />
      <!-- ===== PASEK PIONOWY (left/right, pełna wysokość) ===== -->
      <PipStackLayout v-else :state="state" />
    </template>
  </div>
</template>
