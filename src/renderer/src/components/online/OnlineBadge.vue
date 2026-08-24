<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'accent' | 'green' | 'amber' | 'red';
    size?: 'sm' | 'md';
  }>(),
  {
    variant: 'default',
    size: 'sm'
  }
);

const variants: Record<string, string> = {
  default: 'bg-base-100 text-base-content/70 border border-base-300',
  accent: 'bg-primary/10 text-primary',
  green: 'bg-success/15 text-success',
  amber: 'bg-warning/15 text-warning',
  red: 'bg-error/15 text-error'
};

const sizes: Record<string, string> = {
  sm: 'px-1.5 h-[calc(var(--size-selector)+4px)] text-[10px]',
  md: 'px-2 h-[calc(var(--size-selector)+6px)] text-xs'
};

const cls = computed(
  () =>
    `inline-flex items-center gap-1 rounded-full font-medium ${variants[props.variant]} ${sizes[props.size]}`
);
</script>

<template>
  <span :class="cls">
    <slot />
  </span>
</template>
