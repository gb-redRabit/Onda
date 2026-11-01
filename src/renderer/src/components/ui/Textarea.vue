<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { cn } from '@renderer/utils/cn';

// Wielolinijkowe pole tekstowe: ten sam wygląd i focus co `ui/Input`, żeby
// formularze w Ustawieniach i narzędziach nie miały własnych wariantów.
defineOptions({ inheritAttrs: false });

const model = defineModel<string>();

const props = withDefaults(
  defineProps<{
    rows?: number;
    invalid?: boolean;
    /** `sm` dla gęstych paneli narzędzi. */
    size?: 'sm' | 'md';
  }>(),
  { rows: 3, size: 'md' }
);

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    'w-full resize-y rounded-field border bg-base-200/70 text-base-content transition-colors placeholder:text-base-content/50 focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-45',
    props.size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
    props.invalid
      ? 'border-error focus:border-error'
      : 'border-hairline/80 focus:border-primary/50',
    attrs.class as string | undefined
  )
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <textarea
    v-bind="rest"
    v-model="model"
    :rows="rows"
    :class="classes"
    :aria-invalid="invalid || undefined"
  />
</template>
