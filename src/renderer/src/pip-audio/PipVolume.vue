<script setup lang="ts">
import { VOL_LABEL } from './pipTheme';

/**
 * Etykieta wyciszenia oraz suwak głośności, współdzielone przez wszystkie trzy układy PiP.
 *
 * Każdy układ powtarzał ten sam markup, a potem się rozjeżdżał: układ paska był
 * jedynym, który gubił liczbowy odczyt. `showPct` domyślnie true, więc
 * każda doka go teraz pokazuje, a układ, który naprawdę nie ma miejsca, może
 * jawnie zrezygnować.
 */
withDefaults(
  defineProps<{
    send: (action: string) => void;
    volume: number;
    volLabel: string;
    volPct: string;
    onVolumeInput: (e: Event) => void;
    muted?: boolean;
    layout?: 'horizontal' | 'vertical';
    sliderClass?: string;
    showPct?: boolean;
  }>(),
  {
    layout: 'horizontal',
    sliderClass: 'w-16',
    showPct: true,
    muted: false
  }
);
</script>

<template>
  <div
    class="flex shrink-0 items-center gap-1"
    :class="layout === 'vertical' ? 'flex-col' : ''"
    @dblclick.stop
  >
    <button
      type="button"
      data-testid="pip-mute"
      :class="[VOL_LABEL, 'border-0 bg-transparent font-inherit']"
      :aria-label="muted ? 'Unmute' : 'Mute'"
      @click.stop="send('mute')"
    >
      {{ volLabel }}
    </button>
    <input
      data-testid="pip-volume"
      type="range"
      :class="sliderClass"
      min="0"
      max="1"
      step="0.05"
      :value="volume"
      aria-label="Volume"
      @input="onVolumeInput"
      @click.stop
    />
    <span
      v-if="showPct"
      class="text-3xs tabular-nums text-base-content/50"
      :class="layout === 'vertical' ? '' : 'min-w-5 text-right'"
    >
      {{ volPct }}
    </span>
  </div>
</template>
