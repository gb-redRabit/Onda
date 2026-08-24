<script setup lang="ts">
const props = defineProps<{
  icon: unknown;
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 text-center px-4">
    <component :is="props.icon" :size="64" class="mb-4 text-base-content/20" />
    <p class="text-lg font-semibold text-base-content mb-1">{{ props.title }}</p>
    <p v-if="props.description" class="text-sm text-base-content/70 max-w-md">
      {{ props.description }}
    </p>
    <slot />
  </div>
</template>
