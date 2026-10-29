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
  'ui-page-header relative shrink-0 border-b border-base-300/80 bg-base-100/(--glass-alpha) backdrop-blur',
  props.sticky ? 'sticky top-0 z-10' : '',
  props.compact ? 'px-4 py-2.5' : 'px-5 py-3.5'
]);
</script>

<template>
  <header :class="classes">
    <div class="flex min-w-0 items-center gap-3">
      <span
        v-if="icon"
        class="grid h-8 w-8 shrink-0 place-items-center rounded-field bg-primary/10 text-primary-text"
      >
        <component :is="icon" :size="17" />
      </span>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-base font-semibold tracking-tight text-base-content">
          {{ title }}
        </h1>
        <p v-if="subtitle" class="mt-0.5 truncate text-xs text-base-content/55">{{ subtitle }}</p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.default" class="mt-3 space-y-2.5">
      <slot />
    </div>
    <slot name="overlay" />
  </header>
</template>
