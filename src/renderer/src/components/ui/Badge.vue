<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@renderer/utils/cn';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

const props = withDefaults(
  defineProps<{
    tone?: BadgeTone;
    size?: 'sm' | 'md';
  }>(),
  { tone: 'neutral', size: 'sm' }
);

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-base-300/80 text-base-content/70',
  primary: 'bg-primary/15 text-primary-text',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-error/15 text-error'
};

const classes = computed(() =>
  cn(
    'inline-flex items-center gap-1 rounded-full font-semibold leading-none tabular-nums',
    props.size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
    toneClasses[props.tone]
  )
);
</script>

<template>
  <span :class="classes"><slot /></span>
</template>
