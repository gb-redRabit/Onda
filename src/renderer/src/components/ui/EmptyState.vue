<script setup lang="ts">
import { type Component } from 'vue';

/**
 * Shared empty-state block.
 *
 * Two of these existed — one here, one in components/online — with the same
 * shape (icon, title, description, slot) and different styling. The online copy
 * is now the `plain` variant: no dashed frame, a larger icon and more vertical
 * breathing room, which is what the subscription and search panels want.
 *
 * `data-testid` is forwarded through $attrs to the root element, so callers can
 * target a specific empty state in E2E tests.
 */
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    icon?: Component;
    compact?: boolean;
    /**
     * `panel` is a dashed, bordered box that reads as an inset placeholder.
     * `plain` is borderless and roomier, for a whole-panel "nothing here" state.
     */
    variant?: 'panel' | 'plain';
  }>(),
  { compact: false, variant: 'panel' }
);
</script>

<template>
  <div
    v-if="variant === 'plain'"
    class="flex flex-col items-center justify-center py-16 px-4 text-center"
    role="status"
  >
    <component :is="icon" v-if="icon" :size="64" class="mb-4 text-base-content/20" />
    <p class="mb-1 text-lg font-semibold text-base-content">{{ title }}</p>
    <p v-if="description" class="max-w-md text-sm text-base-content/70">
      {{ description }}
    </p>
    <slot />
  </div>

  <div
    v-else
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
