<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    disabled?: boolean;
    title?: string;
    type?: 'button' | 'submit';
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    type: 'button'
  }
);

const emit = defineEmits<{
  click: [e: MouseEvent];
}>();

const base =
  'inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<string, string> = {
  primary: 'bg-accent-base text-white hover:bg-accent-hover shadow-sm shadow-accent-base/20',
  secondary:
    'bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover hover:text-fg-base',
  ghost: 'text-fg-muted hover:bg-bg-hover hover:text-fg-base',
  danger:
    'bg-bg-elevated border border-border-default text-fg-muted hover:bg-red-base/10 hover:text-red-base hover:border-red-base/30'
};

const sizes: Record<string, string> = {
  sm: 'px-2.5 py-1.5 rounded-lg text-xs',
  md: 'px-3 py-2 rounded-lg text-sm'
};

const cls = computed(() => `${base} ${variants[props.variant]} ${sizes[props.size]}`);
</script>

<template>
  <button
    :type="type"
    :class="cls"
    :disabled="disabled"
    :title="title"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
