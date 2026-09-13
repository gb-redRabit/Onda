<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import AudioControlsCompact from './AudioControlsCompact.vue';
import AudioControlsMicro from './AudioControlsMicro.vue';
import AudioControlsMinimal from './AudioControlsMinimal.vue';
import AudioControlsTall from './AudioControlsTall.vue';
import AudioControlsWide from './AudioControlsWide.vue';

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
    <!-- ═══ WIDE (≥280 × ≥120) ═══ -->
    <AudioControlsWide v-if="mode === 'wide'" :compact="compact" />

    <AudioControlsCompact v-else-if="mode === 'compact'" :compact="compact" />

    <!-- ═══ TALL (<180 × ≥140) ═══ -->
    <AudioControlsTall v-else-if="mode === 'tall'" :compact="compact" />

    <!-- ═══ MINIMAL (<180 × <140, ≥28px tall) ═══ -->
    <AudioControlsMinimal
      v-else-if="mode === 'minimal'"
      :compact="compact"
      :width-sufficient="widthSufficient"
      :volume-fit="volumeFit"
    />

    <!-- ═══ MICRO (<28px tall) — only the play button ═══ -->
    <AudioControlsMicro v-else />
  </div>
</template>
