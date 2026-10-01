<script setup lang="ts">
import { VOL_LABEL } from './pipTheme';

/**
 * Mute label plus the volume slider, shared by all three PiP layouts.
 *
 * Each layout repeated the same markup and then diverged: the bar layout was
 * the only one that dropped the numeric readout. `showPct` defaults to true so
 * every dock now shows it, and a layout that genuinely has no room can opt out
 * explicitly.
 */
withDefaults(
  defineProps<{
    send: (action: string) => void;
    volume: number;
    volLabel: string;
    volPct: string;
    onVolumeInput: (e: Event) => void;
    layout?: 'horizontal' | 'vertical';
    sliderClass?: string;
    showPct?: boolean;
  }>(),
  {
    layout: 'horizontal',
    sliderClass: 'w-16',
    showPct: true
  }
);
</script>

<template>
  <div
    class="flex shrink-0 items-center gap-1"
    :class="layout === 'vertical' ? 'flex-col' : ''"
    @dblclick.stop
  >
    <span data-testid="pip-mute" :class="VOL_LABEL" @click.stop="send('mute')">{{ volLabel }}</span>
    <input
      data-testid="pip-volume"
      type="range"
      :class="sliderClass"
      min="0"
      max="1"
      step="0.05"
      :value="volume"
      @input="onVolumeInput"
      @click.stop
    />
    <span
      v-if="showPct"
      class="text-[9px] tabular-nums text-base-content/50"
      :class="layout === 'vertical' ? '' : 'min-w-5 text-right'"
    >
      {{ volPct }}
    </span>
  </div>
</template>
