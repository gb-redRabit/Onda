<script setup lang="ts">
import { formatDuration } from '@renderer/utils/formatters';

defineProps<{
  position: number;
}>();

defineEmits<{
  continue: [];
  start: [];
}>();
</script>

<template>
  <div
    class="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 bg-black/80 border border-white/15 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-2xl shadow-black/50"
  >
    <div class="text-white text-sm">
      <div class="font-semibold">Wykryto zapisaną pozycję</div>
      <div class="text-white/60 text-xs mt-0.5">
        {{ formatDuration(position) }} — kontynuować czy od początku?
      </div>
    </div>
    <button
      class="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors"
      @click="$emit('continue')"
    >
      Kontynuuj
    </button>
    <button
      class="px-3 py-1.5 rounded-lg bg-accent-base hover:bg-accent-hover text-white text-xs font-medium transition-colors"
      @click="$emit('start')"
    >
      Od początku
    </button>
  </div>
</template>
