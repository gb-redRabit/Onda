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
  default: 'bg-bg-elevated text-fg-muted border border-border-default',
  accent: 'bg-accent-ghost text-accent-base',
  green: 'bg-green-base/15 text-green-base',
  amber: 'bg-amber-base/15 text-amber-base',
  red: 'bg-red-base/15 text-red-base'
};

const sizes: Record<string, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs'
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
