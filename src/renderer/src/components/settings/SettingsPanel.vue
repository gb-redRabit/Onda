<script setup lang="ts">
defineProps<{ title?: string; description?: string }>();
</script>

<template>
  <div class="w-full max-w-3xl mx-auto space-y-6">
    <header
      v-if="title || description || $slots.actions"
      class="flex items-start justify-between gap-4"
    >
      <div class="min-w-0">
        <h2 class="text-2xl font-bold tracking-tight text-fg-base">{{ title }}</h2>
        <p v-if="description" class="mt-1.5 text-sm text-fg-faint">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="shrink-0 flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </div>
</template>
