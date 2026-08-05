<script setup lang="ts">
defineProps<{ label: string; description?: string }>();
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-3">
    <div class="min-w-0">
      <div class="text-sm text-fg-base">{{ label }}</div>
      <div v-if="description" class="mt-0.5 text-xs text-fg-faint">{{ description }}</div>
    </div>
    <div class="shrink-0"><slot /></div>
  </div>
</template>
