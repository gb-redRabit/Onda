<script setup lang="ts">
defineProps<{ title?: string; description?: string }>();
</script>

<template>
  <div class="w-full space-y-6">
    <header
      v-if="title || description || $slots.actions"
      class="flex items-start justify-between gap-3"
    >
      <div class="min-w-0">
        <h2 class="text-xl font-bold text-fg-base">{{ title }}</h2>
        <p v-if="description" class="mt-1 text-xs text-fg-faint">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="shrink-0 flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </div>
</template>
