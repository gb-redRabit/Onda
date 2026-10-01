<script setup lang="ts">
import { EQ_PRESETS } from './usePipAudioState';
import { EQ_BTN, EQ_BTN_ON } from './pipTheme';

/**
 * Rząd presetów equalizera, współdzielony przez układy, które go wystawiają.
 *
 * Kopiowany dosłownie między układami paska i karty. Układ stosu nie ma miejsca
 * na presety i po prostu tego nie renderuje.
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
