<script setup lang="ts">
import { computed } from 'vue';
import { sanitizeHex } from '@shared/themeModel';

// Pole koloru: próbka (`input[type=color]`) + pole HEX. Oba aktualizują ten sam
// model, a wartość jest normalizowana do `#rrggbb`, więc motyw nie dostaje
// zapisu, którego nie da się odczytać.
const model = defineModel<string>({ required: true });

const props = withDefaults(
  defineProps<{
    label: string;
    disabled?: boolean;
    /** Szerokość pola HEX; próbka ma stały rozmiar. */
    wide?: boolean;
  }>(),
  {}
);

const swatch = computed(() => sanitizeHex(model.value) ?? '#000000');

function onSwatch(event: Event): void {
  const target = event.target as HTMLInputElement;
  const hex = sanitizeHex(target.value);
  if (hex) model.value = hex;
}

function onHex(event: Event): void {
  const target = event.target as HTMLInputElement;
  const hex = sanitizeHex(target.value);
  if (hex) model.value = hex;
}
</script>

<template>
  <div class="flex items-center gap-3">
    <input
      type="color"
      :value="swatch"
      :disabled="disabled"
      :aria-label="label"
      class="h-9 w-11 shrink-0 cursor-pointer rounded-field border border-base-content/15 bg-transparent disabled:opacity-45"
      @input="onSwatch"
    />
    <input
      type="text"
      :value="model"
      :disabled="disabled"
      :aria-label="`${label} (HEX)`"
      spellcheck="false"
      :class="[
        'rounded-field border border-base-content/15 bg-base-200/70 px-2.5 py-1.5 font-mono text-xs text-base-content/80 focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-45',
        props.wide ? 'w-full' : 'w-28'
      ]"
      @change="onHex"
    />
  </div>
</template>
