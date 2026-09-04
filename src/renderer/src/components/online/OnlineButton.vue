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
  primary: 'bg-primary text-primary-content hover:bg-primary/90 fx-depth fx-noise shadow-primary/20',
  secondary:
    'bg-base-100 border border-base-300 text-base-content/70 hover:bg-base-content/10 hover:text-base-content',
  ghost: 'text-base-content/70 hover:bg-base-content/10 hover:text-base-content',
  danger:
    'bg-base-100 border border-base-300 text-base-content/70 hover:bg-error/10 hover:text-error hover:border-error/30'
};

const sizes: Record<string, string> = {
  sm: 'px-2.5 py-1.5 rounded-field text-xs',
  md: 'px-3 py-2 rounded-field text-sm'
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
