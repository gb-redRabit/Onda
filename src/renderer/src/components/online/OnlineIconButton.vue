<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'danger';
    size?: 'sm' | 'md';
    disabled?: boolean;
    title?: string;
    active?: boolean;
  }>(),
  {
    variant: 'default',
    size: 'md'
  }
);

const emit = defineEmits<{
  click: [e: MouseEvent];
}>();

const base =
  'inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<string, string> = {
  default: `text-fg-muted hover:bg-bg-hover hover:text-fg-base ${props.active ? 'bg-bg-hover text-fg-base' : ''}`,
  primary: `bg-accent-base text-white hover:bg-accent-hover ${props.active ? 'bg-accent-hover' : ''}`,
  danger: `text-fg-muted hover:bg-red-base/10 hover:text-red-base ${props.active ? 'bg-red-base/10 text-red-base' : ''}`
};

const sizes: Record<string, string> = {
  sm: 'p-1.5',
  md: 'p-2'
};

const cls = computed(() => `${base} ${variants[props.variant]} ${sizes[props.size]}`);
</script>

<template>
  <button
    type="button"
    :class="cls"
    :disabled="disabled"
    :title="title"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
