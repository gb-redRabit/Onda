<script setup lang="ts">
const props = defineProps<{
  icon: unknown;
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 text-center px-4">
    <component :is="props.icon" :size="64" class="mb-4 text-fg-faint/20" />
    <p class="text-lg font-semibold text-fg-base mb-1">{{ props.title }}</p>
    <p v-if="props.description" class="text-sm text-fg-muted max-w-md">
      {{ props.description }}
    </p>
    <slot />
  </div>
</template>
