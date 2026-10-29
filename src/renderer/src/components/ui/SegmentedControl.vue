<script setup lang="ts">
import type { Component } from 'vue';

interface SegmentOption {
  value: string;
  label: string;
  icon?: Component;
}

// Segmentowany wybór jednej wartości z krótkiej listy (tryb, jakość, FPS).
// Wygląd siedzi w `.ui-segmented`, żeby został spójny z istniejącymi paskami.
defineProps<{
  options: SegmentOption[];
  /** Nazwa grupy dla czytnika ekranu. */
  label?: string;
}>();

const model = defineModel<string>({ required: true });
</script>

<template>
  <div class="ui-segmented" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      <component :is="option.icon" v-if="option.icon" :size="13" aria-hidden="true" />
      {{ option.label }}
    </button>
  </div>
</template>
