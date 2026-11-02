<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { cn } from '@renderer/utils/cn';

// Pole liczbowe z jednostką: jedno miejsce na `min`/`max`/`step` i walidację
// zakresu, żeby każdy formularz nie powtarzał tych samych klas i `parseInt`.
defineOptions({ inheritAttrs: false });

const model = defineModel<number>({ required: true });

const props = withDefaults(
  defineProps<{
    label: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    invalid?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
  }>(),
  { step: 1, size: 'md' }
);

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    'rounded-field border bg-base-200/70 text-base-content tabular-nums transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-45',
    props.size === 'sm' ? 'h-8 px-2 text-xs' : 'h-9 px-3 text-sm',
    props.invalid
      ? 'border-error focus:border-error'
      : 'border-base-content/15 focus:border-primary/50',
    attrs.class as string | undefined
  )
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  const raw = target.value.trim();
  // Puste pole nie może zamienić się w 0 (Number('') === 0) — czekamy na liczbę.
  if (raw === '') return;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return;
  const clampedMin = props.min ?? Number.NEGATIVE_INFINITY;
  const clampedMax = props.max ?? Number.POSITIVE_INFINITY;
  model.value = Math.min(clampedMax, Math.max(clampedMin, parsed));
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <input
      v-bind="rest"
      :value="model"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="label"
      :aria-invalid="invalid || undefined"
      :class="classes"
      @input="onInput"
    />
    <span v-if="unit" class="text-xs text-base-content/50">{{ unit }}</span>
  </div>
</template>
