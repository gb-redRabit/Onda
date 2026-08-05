<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div>
    <h3 class="text-sm font-semibold text-fg-base">{{ title }}</h3>
    <p v-if="description" class="mt-0.5 text-xs text-fg-faint">{{ description }}</p>
  </div>
</template>
