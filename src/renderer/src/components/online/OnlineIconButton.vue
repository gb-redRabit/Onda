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
  'inline-flex items-center justify-center rounded-field transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<string, string> = {
  default: `text-base-content/70 hover:bg-base-content/10 hover:text-base-content ${props.active ? 'bg-base-content/10 text-base-content' : ''}`,
  primary: `bg-primary text-primary-content hover:bg-primary/90 ${props.active ? 'bg-primary/90' : ''}`,
  danger: `text-base-content/70 hover:bg-error/10 hover:text-error ${props.active ? 'bg-error/10 text-error' : ''}`
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
