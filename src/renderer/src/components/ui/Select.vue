<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { cn } from '@renderer/utils/cn';

// Natywny `<select>` w tym samym opakowaniu co `ui/Input`: jeden wygląd pól w
// formularzach bez własnej implementacji listy rozwijanej.
defineOptions({ inheritAttrs: false });

const model = defineModel<string | number>();

const props = withDefaults(defineProps<{ size?: 'sm' | 'md'; invalid?: boolean }>(), {
  size: 'md'
});

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    'w-full rounded-field border bg-base-200/70 text-base-content transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-45',
    props.size === 'sm' ? 'h-8 px-2 pr-7 text-xs' : 'h-9 px-3 pr-8 text-sm',
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
  <select v-bind="rest" v-model="model" :class="classes" :aria-invalid="invalid || undefined">
    <slot />
  </select>
</template>
