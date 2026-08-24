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
    class="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 bg-black/80 border border-white/15 rounded-box px-5 py-4 flex items-center gap-4 shadow-2xl shadow-black/50"
  >
    <div class="text-white text-sm">
      <div class="font-semibold">{{ $t('resume.title') }}</div>
      <div class="text-white/60 text-xs mt-0.5">
        {{ formatDuration(position) }} {{ $t('resume.question') }}
      </div>
    </div>
    <button
      class="fx-noise px-3 py-1.5 fx-depth rounded-field bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors"
      @click="$emit('continue')"
    >
      {{ $t('resume.continue') }}
    </button>
    <button
      class="fx-noise px-3 py-1.5 fx-depth rounded-field bg-primary hover:bg-primary/90 text-primary-content text-xs font-medium transition-colors"
      @click="$emit('start')"
    >
      {{ $t('resume.fromStart') }}
    </button>
  </div>
</template>
