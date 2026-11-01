<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { cn } from '@renderer/utils/cn';

// Suwak z wymaganą nazwą dostępną: bez `label` czytnik ekranu ogłasza tylko
// „suwak”, a użytkownik nie wie, co zmienia. Wartość pokazuje wywołujący
// (np. „24 px”), bo format zależy od kontekstu.
defineOptions({ inheritAttrs: false });

const model = defineModel<number>({ required: true });

withDefaults(
  defineProps<{
    label: string;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    /** Opis wartości dla czytnika, np. „Głośność: 40%”. */
    valueText?: string;
  }>(),
  { min: 0, max: 100, step: 1 }
);

const attrs = useAttrs();

const classes = computed(() =>
  cn('w-full accent-primary disabled:opacity-45', attrs.class as string | undefined)
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <input
    v-bind="rest"
    v-model.number="model"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-label="label"
    :aria-valuetext="valueText"
    :class="classes"
  />
</template>
