<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { cn } from '@renderer/utils/cn';

// Pole tekstowe z jednym wyglądem w całej aplikacji. `class` z zewnątrz
// przechodzi przez `cn`, więc można np. zmienić szerokość bez kopiowania klas.
defineOptions({ inheritAttrs: false });

const model = defineModel<string | number>();

const props = withDefaults(
  defineProps<{
    type?: string;
    size?: 'sm' | 'md';
    invalid?: boolean;
  }>(),
  { type: 'text', size: 'md' }
);

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    'w-full rounded-field border bg-base-200/70 text-base-content transition-colors placeholder:text-base-content/50 focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-45',
    props.size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
    props.invalid
      ? 'border-error focus:border-error'
      : 'border-base-300/80 focus:border-primary/50',
    attrs.class as string | undefined
  )
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <input
    v-bind="rest"
    v-model="model"
    :type="type"
    :class="classes"
    :aria-invalid="invalid || undefined"
  />
</template>
