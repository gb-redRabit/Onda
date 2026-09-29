<script setup lang="ts">
import { type Component } from 'vue';

// `data-testid` is forwarded through $attrs to the root element, so callers can
// target a specific empty state in E2E tests.
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    icon?: Component;
    compact?: boolean;
  }>(),
  { compact: false }
);
</script>

<template>
  <div
    class="flex flex-col items-center justify-center rounded-box border border-dashed border-base-300 text-center text-base-content/55"
    :class="compact ? 'gap-2 p-6' : 'gap-3 p-10'"
    role="status"
  >
    <component :is="icon" v-if="icon" :size="compact ? 28 : 40" class="opacity-35" />
    <div>
      <p class="text-sm font-medium text-base-content/75">{{ title }}</p>
      <p v-if="description" class="mt-1 text-xs">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
