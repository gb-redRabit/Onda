<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import AudioControlsCore from './AudioControlsCore.vue';
import AudioControlsMicro from './AudioControlsMicro.vue';

import { calcMode, type LayoutMode } from '@renderer/utils/audioControls';

const props = defineProps<{ variant?: string }>();

const compact = computed(() => props.variant === 'compact');

const rootEl = ref<HTMLElement | null>(null);
const mode = ref<LayoutMode>('wide');

let ro: ResizeObserver | null = null;
const boxW = ref(0);
const boxH = ref(0);
const widthSufficient = computed(() => boxW.value >= 120);
const volumeFit = computed(() => boxH.value >= 42);

onMounted(() => {
  if (!rootEl.value) return;
  ro = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    boxW.value = width;
    boxH.value = height;
    mode.value = calcMode(width, height);
  });
  ro.observe(rootEl.value);
});

onBeforeUnmount(() => {
  ro?.disconnect();
});
</script>

<template>
  <div ref="rootEl" class="w-full h-full overflow-hidden">
    <!-- ═══ MICRO (<28px tall) — only the play button ═══ -->
    <AudioControlsMicro v-if="mode === 'micro'" />

    <!--
      ═══ WIDE (≥280 × ≥120) ═══
      ═══ COMPACT (≥180 × ≥100) ═══
      ═══ TALL (<180 × ≥140) ═══
      ═══ MINIMAL (<180 × <140, ≥28px tall) ═══
      One component; the differences are presentation only, and they live in
      DENSITY (utils/audioControls.ts).
    -->
    <AudioControlsCore
      v-else
      :variant="mode"
      :compact="compact"
      :width-sufficient="widthSufficient"
      :volume-fit="volumeFit"
    />
  </div>
</template>
