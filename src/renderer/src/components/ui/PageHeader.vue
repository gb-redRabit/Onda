<script setup lang="ts">
import { computed, type Component } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon?: Component;
    sticky?: boolean;
    compact?: boolean;
  }>(),
  { sticky: false, compact: false }
);

const classes = computed(() => [
  'ui-page-header relative border-b border-base-300 bg-base-100/(--glass-alpha) backdrop-blur',
  props.sticky ? 'sticky top-0 z-10' : '',
  props.compact ? 'px-4 py-3' : 'px-5 py-4'
]);
</script>

<template>
  <header :class="classes">
    <div class="flex min-w-0 items-center gap-3">
      <component :is="icon" v-if="icon" :size="22" class="shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-bold tracking-tight text-base-content">{{ title }}</h1>
        <p v-if="subtitle" class="mt-0.5 truncate text-xs text-base-content/55">{{ subtitle }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.default" class="mt-3 space-y-3">
      <slot />
    </div>
    <slot name="overlay" />
  </header>
</template>
