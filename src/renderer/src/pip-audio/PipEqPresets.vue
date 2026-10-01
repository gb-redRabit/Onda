<script setup lang="ts">
import { EQ_PRESETS } from './usePipAudioState';
import { EQ_BTN, EQ_BTN_ON } from './pipTheme';

/**
 * Equalizer preset row, shared by the layouts that expose it.
 *
 * Copied verbatim between the bar and card layouts. The stack layout has no room
 * for presets and simply does not render this.
 */
defineProps<{
  eqPreset: string;
  selectEqPreset: (id: string) => void;
}>();
</script>

<template>
  <div class="flex shrink-0 items-center gap-0.5" @dblclick.stop>
    <button
      v-for="p in EQ_PRESETS.slice(0, 4)"
      :key="p.id"
      :data-testid="'pip-eq-' + p.id"
      :class="[EQ_BTN, eqPreset === p.id ? EQ_BTN_ON : '']"
      @click.stop="selectEqPreset(p.id)"
    >
      {{ p.label }}
    </button>
  </div>
</template>
